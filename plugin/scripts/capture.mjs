// Tour-driven capture runner. Reads a tour YAML, applies its preconditions
// (auth via storage-state reuse), executes its steps in order, and at each
// capture point shoots every configured viewport, writing
// <capture>@<viewport>.png + .a11y.json plus a manifest.json entry with a
// SHA-256 per viewport, computed on the masked screenshot.
//
// Single-tour invocation (`--tour <id>`, the common case, and what
// SKILL.md's Step 1 drives) behaves exactly as it always has, including its
// exact error-propagation format. A multi-tour invocation (repeated
// `--tour`, or `--all`) runs through one shared browser launch with a
// bounded concurrency pool (see lib/capture-plan.mjs's planCaptureBatches)
// and isolates each tour's failure from its siblings — one tour going wrong
// doesn't stop the rest of the run.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { sha256Buffer, buildManifest, saveManifestEntry } from './lib/manifest.mjs';
import { mergeMasks } from './lib/masking.mjs';
import { resolveSeed } from './lib/seed.mjs';
import { ensureAuthState, primaryViewport } from './lib/auth.mjs';
import { isSameOrigin } from './lib/crawl.mjs';
import { withRetry } from './lib/retry.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';
import { recordCaptureResult } from './lib/state.mjs';
import { planCaptureBatches } from './lib/capture-plan.mjs';
import { loadDocStyle } from './lib/design.mjs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const MASK_COLOR = '#FF00FF';
const SEED_COMMAND_TIMEOUT_MS = 2 * 60 * 1000; // generous, but bounded — a hung seed script shouldn't hang capture
const DEFAULT_CONCURRENCY = 3;

// Neutral default — this repo's own CLAUDE.md opts DocSolace itself out of
// inheriting a parent brand, so nothing here should default to one either.
// Overridable per-project via .docsolace/doc-style.json's page.highlightColor
// (see lib/design.mjs's loadDocStyle) when a design skill supplies an
// accent color — presentation only, same as every other doc-style knob.
const DEFAULT_HIGHLIGHT_COLOR = '#FF3B30';
const HIGHLIGHT_ATTR = 'data-docsolace-highlight';

// Fixed, deterministic CSS — no transition/animation, nothing time- or
// layout-dependent. Two things matter here: `outline` (not `border` or a
// layout-affecting property) draws entirely outside the element's box
// without reflowing anything around it, so highlighting one element can't
// shift another element's position or invalidate an unrelated mask region's
// coordinates; and this exact string must render identically on every
// capture of the same commit — the whole drift gate's premise is that the
// masked screenshot hash is stable run to run, and a highlight that varied
// (even subtly, e.g. via an animation) would make it dirty every time.
function buildHighlightCss(color) {
  return `[${HIGHLIGHT_ATTR}] { outline: 3px solid ${color} !important; outline-offset: 2px !important; }`;
}

// Applies the highlight attribute to a step's target element, if it exists
// and is visible at the *current* viewport — checked fresh per viewport
// (not once for the whole step), since an element visible at desktop may be
// collapsed behind a menu at mobile. Never throws: a missing/hidden/
// malformed-locator target degrades to "capture without a highlight" rather
// than failing the whole tour over a cosmetic annotation.
//
// Re-injects the highlight <style> tag every call rather than once per tour
// — confirmed by an actual capture run that a tag injected before the
// tour's first `goto` never survives that navigation (Playwright's
// addStyleTag targets the current document; a full navigation replaces it
// entirely, silently dropping the tag with no error). Cheap and idempotent
// enough to just always redo it right before it's needed instead of trying
// to track every navigation that might have invalidated it.
async function applyHighlight(page, selector, css) {
  const locator = page.locator(selector).first();
  let visible;
  try {
    visible = await locator.isVisible();
  } catch {
    // A malformed or unsupported locator string throws here rather than
    // resolving to "not visible" — treated the same way. validate.mjs
    // separately warns when a highlight isn't a role=/text= locator; that's
    // a load-time nudge toward a better selector, not a reason to fail a
    // capture that's otherwise working.
    visible = false;
  }
  if (!visible) return false;
  await page.addStyleTag({ content: css });
  await locator.evaluate((el, attr) => el.setAttribute(attr, ''), HIGHLIGHT_ATTR);
  return true;
}

async function removeHighlight(page, selector) {
  await page
    .locator(selector)
    .first()
    .evaluate((el, attr) => el.removeAttribute(attr), HIGHLIGHT_ATTR);
}

function parseArgs(argv) {
  const args = { tours: [], all: false, allowSeedCommands: false, continueOnError: false, concurrency: DEFAULT_CONCURRENCY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tours.push(argv[++i]);
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--allow-seed-commands') args.allowSeedCommands = true;
    else if (argv[i] === '--continue-on-error') args.continueOnError = true;
    else if (argv[i] === '--concurrency') {
      const raw = argv[++i];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) {
        console.error(`--concurrency must be a positive integer, got "${raw}"`);
        process.exit(1);
      }
      args.concurrency = value;
    }
  }
  if (!args.all && args.tours.length === 0) {
    console.error(
      'Usage: capture.mjs --tour <tour-id> [--tour <tour-id> ...] | --all  ' +
        '[--continue-on-error] [--concurrency <n>] [--allow-seed-commands]',
    );
    process.exit(1);
  }
  if (args.all && args.tours.length > 0) {
    console.error('--all and --tour are mutually exclusive — use one or the other.');
    process.exit(1);
  }
  return args;
}

// Executes a seed's command (config-authored, see lib/seed.mjs's comment on
// why that's the trust boundary) in the project's own directory, streaming
// its output directly rather than buffering it, with a bounded timeout so a
// hung seed script can't hang capture indefinitely.
function runSeedCommand(command) {
  const result = spawnSync(command, { cwd: process.cwd(), shell: true, stdio: 'inherit', timeout: SEED_COMMAND_TIMEOUT_MS });
  if (result.error) {
    throw new Error(`Seed command failed to start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(
      `Seed command was killed by signal ${result.signal} (it may have exceeded the ` +
        `${SEED_COMMAND_TIMEOUT_MS}ms timeout).`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Seed command exited with status ${result.status}.`);
  }
}

// Applies a tour's preconditions.seed, if it has one, before anything else
// runs for that tour. Data seeding doesn't need a browser, so this happens
// before touching one — a failed or disabled seed is cheaper to fail fast on
// here.
function applySeed(config, seedId, { allowSeedCommands }) {
  const resolution = resolveSeed(config, seedId, { allowSeedCommands });
  switch (resolution.action) {
    case 'error':
      throw new Error(resolution.message);
    case 'noop':
    case 'skipped-disabled':
      console.log(resolution.message);
      return;
    case 'run':
      console.log(resolution.message);
      runSeedCommand(resolution.command);
      return;
    default:
      throw new Error(`Unknown seed resolution action "${resolution.action}"`);
  }
}

// preconditions.voice feeds a fixture audio file into Chromium as a fake
// microphone — set once at browser launch (not per-step, unlike every other
// interaction), because Chromium's fake-audio-capture flags only take effect
// at launch time. Both flags are required, verified empirically:
// --use-fake-device-for-media-stream alone throws "NotSupportedError" from
// getUserMedia; --use-fake-ui-for-media-stream is what actually gets it
// working (it also auto-accepts the permission prompt, so no extra
// browser-context permission grant is needed).
function buildLaunchArgs(config, tour) {
  const launchArgs = [...(config.launchArgs ?? [])];
  if (tour.preconditions?.voice) {
    if (!fs.existsSync(tour.preconditions.voice)) {
      throw new Error(
        `Tour "${tour.id}"'s preconditions.voice fixture "${tour.preconditions.voice}" doesn't exist — ` +
          `create it under fixtures/ before capturing. Run \`node validate.mjs\` (or ` +
          `\`/docsolace:document validate\`) to catch this before launching a browser next time.`,
      );
    }
    launchArgs.push(
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${path.resolve(tour.preconditions.voice)}`,
    );
  }
  return launchArgs;
}

function summarizeFailures(stepFailures) {
  return `${stepFailures.length} step failure(s): ${stepFailures.map((f) => `step ${f.index} (${f.message})`).join('; ')}`;
}

async function runTour(browser, config, tour, { continueOnError = false } = {}) {
  const screenshotsDir = path.join(config.outputDir, 'screenshots', tour.id);
  const snapshotsDir = path.join(config.outputDir, 'snapshots', tour.id);
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(snapshotsDir, { recursive: true });

  let storageState;
  if (tour.preconditions?.auth) {
    storageState = await ensureAuthState(browser, config, tour.preconditions.auth);
  }

  // A context leaked from a failed step would otherwise outlive this
  // function (only browser.close() at the very end would reap it) —
  // try/finally guarantees it's closed on the success path and on any step
  // failure alike.
  const context = await browser.newContext({ viewport: primaryViewport(config), storageState });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Computed once per tour (not re-read per step/viewport) — a plain
    // string build, no DOM interaction, so there's no navigation-timing
    // concern here the way there is for actually injecting it (see
    // applyHighlight, which re-injects this fresh before every use).
    const highlightCss = buildHighlightCss(loadDocStyle(process.cwd()).page?.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR);

    const captures = [];
    const stepFailures = [];
    const baseOrigin = new URL(config.baseUrl).origin;
    // A reused auth session (storageStatePath, or a previously-cached
    // scripted login — see ensureAuthState) is never revalidated before
    // this point. If it's expired, the app typically bounces the very next
    // navigation off to a login/consent screen on a different origin —
    // checked once, right after the tour's first goto, so a stale session
    // fails loudly here instead of silently capturing (and shipping) login
    // screenshots mislabeled as the real feature. Scoped to off-origin
    // landings only, not every goto: a same-origin app-level /login page
    // isn't caught by this, avoiding false positives on legitimate
    // same-app redirects later in the tour.
    let authSessionChecked = !tour.preconditions?.auth;

    for (const [index, step] of tour.steps.entries()) {
      try {
        if (step.action === 'goto') {
          await withRetry(() => page.goto(`${config.baseUrl}${step.path}`, { waitUntil: 'networkidle' }));
          if (!authSessionChecked) {
            authSessionChecked = true;
            if (!isSameOrigin(page.url(), baseOrigin)) {
              throw new Error(
                `the reused session for auth profile "${tour.preconditions.auth}" appears expired or ` +
                  `invalid — after navigating to "${step.path}", the page ended up at "${page.url()}" ` +
                  `(a different origin than baseUrl), which usually means the app redirected to a login ` +
                  `or consent screen instead of the requested page. Re-run save-auth-state.mjs to record ` +
                  `a fresh session (storageStatePath profiles), or delete the cached session under ` +
                  `${path.join(config.outputDir, '.auth', `${tour.preconditions.auth}.json`)} to force a ` +
                  `fresh scripted login next run.`,
              );
            }
          }
        } else if (step.action === 'click') {
          await page.locator(step.selector).click();
          await page.waitForLoadState('networkidle');
        } else if (step.action === 'upload') {
          await page.locator(step.selector).setInputFiles(step.file);
          await page.waitForLoadState('networkidle');
        } else if (step.action === 'fill') {
          // No post-action networkidle wait for fill/type/select/check/
          // hover/press (unlike goto/click/upload above): these are
          // synchronous UI edits with nothing to wait on beyond Playwright's
          // own per-action actionability auto-wait, and forcing a
          // network-idle wait would actively break apps that hold an open
          // SSE/WebSocket connection (e.g. streaming AI chat) — that never
          // goes network-idle, so the wait would hang for the full default
          // timeout on every step after the connection opens. Use an
          // explicit `wait` step (below) when a step genuinely needs to
          // pause for something async.
          await page.locator(step.selector).fill(step.value);
        } else if (step.action === 'type') {
          await page.locator(step.selector).pressSequentially(step.value);
        } else if (step.action === 'select') {
          await page.locator(step.selector).selectOption(step.value);
        } else if (step.action === 'check') {
          await page.locator(step.selector).setChecked(step.checked ?? true);
        } else if (step.action === 'press') {
          await page.locator(step.selector).press(step.key);
        } else if (step.action === 'hover') {
          await page.locator(step.selector).hover();
        } else if (step.action === 'wait') {
          await withRetry(() => page.locator(step.selector).waitFor({ state: step.state }));
        } else if (step.capture) {
          const maskSelectors = mergeMasks(config.defaultMask, step.mask);
          const viewportShots = {};

          for (const [viewportName, viewportSize] of Object.entries(config.viewports)) {
            // Re-thrown with which viewport was in flight — without this, a
            // failure partway through a multi-viewport capture (e.g. the
            // mobile shot times out after desktop already succeeded) only
            // surfaces the step index, leaving which of N viewports failed
            // to guesswork.
            try {
              await page.setViewportSize(viewportSize);

              // Checked fresh at this viewport (see applyHighlight) — an
              // element visible at desktop may be hidden behind a collapsed
              // menu at mobile. Never fails the capture; a missing/hidden
              // target just means this viewport's shot has no highlight.
              const highlightApplied = step.highlight ? await applyHighlight(page, step.highlight, highlightCss) : false;
              if (step.highlight && !highlightApplied) {
                console.warn(
                  `  ! viewport "${viewportName}": highlight target "${step.highlight}" for capture ` +
                    `"${step.capture}" isn't visible — capturing without a highlight.`,
                );
              }

              const maskLocators = maskSelectors.map((selector) => page.locator(selector));
              const pngPath = path.join(screenshotsDir, `${step.capture}@${viewportName}.png`);
              await page.screenshot({ path: pngPath, mask: maskLocators, maskColor: MASK_COLOR });

              if (highlightApplied) {
                await removeHighlight(page, step.highlight);
              }

              const ariaSnapshot = await page.locator('body').ariaSnapshot();
              const a11yPath = path.join(snapshotsDir, `${step.capture}@${viewportName}.a11y.json`);
              writeFileAtomic(
                a11yPath,
                JSON.stringify(
                  { capture: step.capture, viewport: viewportName, description: step.description ?? null, ariaSnapshot },
                  null,
                  2,
                ),
              );

              viewportShots[viewportName] = {
                png: path.relative(config.outputDir, pngPath),
                a11y: path.relative(config.outputDir, a11yPath),
                sha256: sha256Buffer(fs.readFileSync(pngPath)),
              };
            } catch (err) {
              throw new Error(`viewport "${viewportName}": ${err.message}`);
            }
          }

          // Restore the primary viewport so subsequent goto/click steps
          // interact with the layout the tour was authored against.
          await page.setViewportSize(primaryViewport(config));

          captures.push({
            name: step.capture,
            description: step.description ?? null,
            viewports: viewportShots,
          });
        } else {
          throw new Error(
            'is neither a goto/click/upload/fill/type/select/check/press/hover/wait action nor a capture',
          );
        }
      } catch (err) {
        const message = `Tour "${tour.id}" step ${index}: ${err.message}`;
        if (!continueOnError) throw new Error(message);
        // Best-effort: record the failure and keep going — a later step
        // (especially an independent capture point) may still succeed even
        // though this one didn't. generate-docs.mjs refuses to render a
        // manifest entry this produces (see its own "partial" check) so a
        // tutorial silently missing a step never ships unnoticed.
        console.error(`  ! ${message} — continuing (--continue-on-error)`);
        stepFailures.push({ index, message: err.message });
      }
    }

    return buildManifest(tour.id, captures, undefined, { stepFailures });
  } finally {
    await context.close();
  }
}

// Single-tour path — unchanged in structure and error-propagation format
// from before multi-tour support existed. SKILL.md's Step 1 depends on a
// fatal failure here reaching the top-level `main().catch` verbatim (e.g. to
// relay an exact save-auth-state.mjs command), so this stays a direct call
// rather than being routed through captureManyTours' per-tour isolation.
async function captureSingleTour(config, tourId, { allowSeedCommands, continueOnError, statePath }) {
  const tour = loadTour('tours', tourId);

  // Mirrors generate-docs.mjs's own archived skip: an archived tour's
  // feature is gone, so driving the app to "capture" it would either hit a
  // 404 or fail confusingly partway through a step whose selector no longer
  // exists. Nothing to do here — its existing screenshots live on under
  // docs/archive/. Flip status back to "confirmed" by hand (or via
  // archive-tour.mjs's own reversal note) before re-capturing.
  if (tour.status === 'archived') {
    console.log(`Skipping "${tour.id}": status is "archived" — its feature is gone, so it can't be captured.`);
    return;
  }

  if (tour.preconditions?.seed) {
    applySeed(config, tour.preconditions.seed, {
      allowSeedCommands: allowSeedCommands || config.allowSeedCommands === true,
    });
  }

  const launchArgs = buildLaunchArgs(config, tour);
  const browser = await chromium.launch({ args: launchArgs });
  try {
    let manifest;
    try {
      manifest = await runTour(browser, config, tour, { continueOnError });
    } catch (err) {
      recordCaptureResult(statePath, tour.id, { error: err.message });
      throw err;
    }
    saveManifestEntry(path.join(config.outputDir, 'manifest.json'), manifest);
    recordCaptureResult(statePath, tour.id, { error: manifest.partial ? summarizeFailures(manifest.stepFailures) : null });

    console.log(
      `Captured ${tour.id}: ${manifest.captures.length} capture(s)${manifest.partial ? ' — PARTIAL, see failures below' : ''}.`,
    );
    for (const c of manifest.captures) {
      const shots = Object.entries(c.viewports)
        .map(([name, v]) => `${name}=${v.sha256.slice(0, 8)}...`)
        .join(', ');
      console.log(`  - ${c.name}: ${shots}`);
    }
    if (manifest.partial) {
      console.error(`  ${manifest.stepFailures.length} step failure(s) (--continue-on-error):`);
      for (const f of manifest.stepFailures) console.error(`    step ${f.index}: ${f.message}`);
      // Exit non-zero even though a manifest was saved — an autonomous
      // caller (the /document skill) must still see this as a failure
      // needing attention, not a silently-accepted partial result.
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

// Captures one tour within a multi-tour run, isolating its outcome from its
// siblings — a fatal failure here is caught and reported, never thrown, so
// one tour going wrong doesn't abort tours already in flight in the same
// batch or any batch after it.
async function captureOneTourIsolated(browser, config, tour, { allowSeedCommands, continueOnError, statePath }) {
  try {
    if (tour.preconditions?.seed) {
      applySeed(config, tour.preconditions.seed, {
        allowSeedCommands: allowSeedCommands || config.allowSeedCommands === true,
      });
    }
    const manifest = await runTour(browser, config, tour, { continueOnError });
    saveManifestEntry(path.join(config.outputDir, 'manifest.json'), manifest);
    recordCaptureResult(statePath, tour.id, { error: manifest.partial ? summarizeFailures(manifest.stepFailures) : null });
    return {
      tourId: tour.id,
      ok: true,
      captureCount: manifest.captures.length,
      partial: !!manifest.partial,
      stepFailures: manifest.stepFailures ?? [],
    };
  } catch (err) {
    recordCaptureResult(statePath, tour.id, { error: err.message });
    return { tourId: tour.id, ok: false, error: err.message };
  }
}

// Multi-tour path (repeated --tour, or --all): one shared browser launch,
// tours grouped into concurrency-bounded batches (seeded tours run alone —
// see lib/capture-plan.mjs), each tour's outcome isolated from its siblings.
async function captureManyTours(config, tourIds, { allowSeedCommands, continueOnError, concurrency, statePath }) {
  const tours = [];
  for (const tourId of tourIds) {
    const tour = loadTour('tours', tourId);
    if (tour.status === 'archived') {
      console.log(`Skipping "${tour.id}": status is "archived" — its feature is gone, so it can't be captured.`);
      continue;
    }
    tours.push(tour);
  }
  if (tours.length === 0) {
    console.log('Nothing to capture — every requested tour is archived.');
    return;
  }

  // A voice fixture is set once at browser-launch time (see
  // buildLaunchArgs), shared by every tour in this run. Two tours needing
  // *different* fixture files can't both be satisfied by one shared launch
  // — caught here, before launching anything, rather than letting whichever
  // tour's voice step runs second silently get the wrong fixture (or none).
  const voiceTours = tours.filter((t) => t.preconditions?.voice);
  const voicePaths = new Set(voiceTours.map((t) => path.resolve(t.preconditions.voice)));
  if (voicePaths.size > 1) {
    throw new Error(
      `This run's tours need different preconditions.voice fixtures (${[...voicePaths].join(', ')}) — a ` +
        `shared browser launch can only use one. Capture these tours in separate invocations instead.`,
    );
  }
  const launchArgs = voiceTours.length > 0 ? buildLaunchArgs(config, voiceTours[0]) : [...(config.launchArgs ?? [])];

  const batches = planCaptureBatches(tours, { concurrency });
  const browser = await chromium.launch({ args: launchArgs });
  const results = [];
  try {
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((tour) => captureOneTourIsolated(browser, config, tour, { allowSeedCommands, continueOnError, statePath })),
      );
      results.push(...batchResults);
    }
  } finally {
    await browser.close();
  }

  let anyFailed = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`Captured ${r.tourId}: ${r.captureCount} capture(s)${r.partial ? ' — PARTIAL, see below' : ''}.`);
      if (r.partial) {
        anyFailed = true;
        for (const f of r.stepFailures) console.error(`  step ${f.index}: ${f.message}`);
      }
    } else {
      anyFailed = true;
      console.error(`Failed ${r.tourId}: ${r.error}`);
    }
  }
  if (anyFailed) process.exit(1);
}

async function main() {
  const { tours: requestedIds, all, allowSeedCommands, continueOnError, concurrency } = parseArgs(process.argv.slice(2));
  const config = loadConfig('docsolace.config.yaml');
  const statePath = path.join(config.outputDir, 'state.json');

  const tourIds = all
    ? fs
        .readdirSync('tours')
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => f.replace(/\.yaml$/, ''))
    : requestedIds;

  if (tourIds.length === 0) {
    console.log('No tours under tours/ to capture.');
    return;
  }

  if (tourIds.length === 1) {
    await captureSingleTour(config, tourIds[0], { allowSeedCommands, continueOnError, statePath });
    return;
  }

  await captureManyTours(config, tourIds, { allowSeedCommands, continueOnError, concurrency, statePath });
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
