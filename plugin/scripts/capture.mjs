// Tour-driven capture runner. Reads a tour YAML, applies its preconditions
// (auth via storage-state reuse), executes its steps in order, and at each
// capture point shoots every configured viewport, writing
// <capture>@<viewport>.png + .a11y.json plus a manifest.json entry with a
// SHA-256 per viewport, computed on the masked screenshot.
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

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const MASK_COLOR = '#FF00FF';
const SEED_COMMAND_TIMEOUT_MS = 2 * 60 * 1000; // generous, but bounded — a hung seed script shouldn't hang capture

function parseArgs(argv) {
  const args = { allowSeedCommands: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
    if (argv[i] === '--allow-seed-commands') args.allowSeedCommands = true;
  }
  if (!args.tour) {
    console.error('Usage: capture.mjs --tour <tour-id> [--allow-seed-commands]');
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
// runs. Data seeding doesn't need a browser, so this happens before
// launching one — a failed or disabled seed is cheaper to fail fast on here.
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

async function runTour(browser, config, tour) {
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

    const captures = [];
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

              const maskLocators = maskSelectors.map((selector) => page.locator(selector));
              const pngPath = path.join(screenshotsDir, `${step.capture}@${viewportName}.png`);
              await page.screenshot({ path: pngPath, mask: maskLocators, maskColor: MASK_COLOR });

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
        throw new Error(`Tour "${tour.id}" step ${index}: ${err.message}`);
      }
    }

    return buildManifest(tour.id, captures);
  } finally {
    await context.close();
  }
}

async function main() {
  const { tour: tourId, allowSeedCommands } = parseArgs(process.argv.slice(2));
  const config = loadConfig('autodocs.config.yaml');
  const tour = loadTour('tours', tourId);

  if (tour.preconditions?.seed) {
    applySeed(config, tour.preconditions.seed, {
      allowSeedCommands: allowSeedCommands || config.allowSeedCommands === true,
    });
  }

  // preconditions.voice feeds a fixture audio file into Chromium as a fake
  // microphone — this is set once at browser launch (not per-step, unlike
  // every other interaction), because Chromium's fake-audio-capture flags
  // only take effect at launch time. Both flags are required, verified
  // empirically: --use-fake-device-for-media-stream alone throws
  // "NotSupportedError" from getUserMedia; --use-fake-ui-for-media-stream
  // is what actually gets it working (it also auto-accepts the permission
  // prompt, so no extra browser-context permission grant is needed).
  const launchArgs = [...(config.launchArgs ?? [])];
  if (tour.preconditions?.voice) {
    if (!fs.existsSync(tour.preconditions.voice)) {
      throw new Error(
        `Tour "${tour.id}"'s preconditions.voice fixture "${tour.preconditions.voice}" doesn't exist — ` +
          `create it under fixtures/ before capturing. Run \`node validate.mjs\` (or ` +
          `\`/autodocs:document validate\`) to catch this before launching a browser next time.`,
      );
    }
    launchArgs.push(
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${path.resolve(tour.preconditions.voice)}`,
    );
  }
  const browser = await chromium.launch({ args: launchArgs });
  try {
    const manifest = await runTour(browser, config, tour);
    saveManifestEntry(path.join(config.outputDir, 'manifest.json'), manifest);
    console.log(`Captured ${tour.id}: ${manifest.captures.length} capture(s).`);
    for (const c of manifest.captures) {
      const shots = Object.entries(c.viewports)
        .map(([name, v]) => `${name}=${v.sha256.slice(0, 8)}...`)
        .join(', ');
      console.log(`  - ${c.name}: ${shots}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
