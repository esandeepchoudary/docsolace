// Assembles docs/<tour-id>.md from a tour's captures (screenshots + a11y
// snapshots) via scripts/lib/docgen.mjs, gated by the drift check and the
// pixel-diff threshold. Prose comes from whichever the `doc-scribe` subagent
// wrote to .autodocs/artifacts/prose/<tour-id>.json (see plugin/agents/
// doc-scribe.md); the PARAGRAPHS map below is a fallback for the two demo
// tours so the pipeline is runnable without invoking a subagent.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { applyKeepRegion, nonKeepContent, RENDER_TEMPLATE_VERSION, renderTourPage } from './lib/docgen.mjs';
import { findMissingViewports, flattenScreenshotHashes, loadManifest, sha256Buffer } from './lib/manifest.mjs';
import { computeCodePathsHash, isTourDirty, resolveShortHeadCommit } from './lib/drift.mjs';
import { computeRenderHash, loadDocStyle } from './lib/design.mjs';
import { buildFrontmatter, computeTourSidebarPositions, isPublishedTour, resolveTourLinks } from './lib/product.mjs';
import { loadState, saveTourState } from './lib/state.mjs';
import { pixelDiffRatio, writeDiffImage } from './lib/pixel-diff.mjs';

const PARAGRAPHS = {
  login: {
    'login-full':
      'The sign-in form is the first thing a signed-out visitor sees. It asks for a ' +
      'username and password and has a single primary action, the "Sign in" button.',
  },
  dashboard: {
    'dashboard-full':
      'After signing in, the dashboard opens with three key-metric cards — active ' +
      'users, open tickets, and uptime — followed by a "Filters" button and a table ' +
      'of recent activity, where each row shows who acted, what they did, and its status.',
    'dashboard-filters':
      'Clicking "Filters" expands a panel with a Status dropdown (All, Done, Pending) ' +
      'above the activity table, letting you narrow the table to a single status.',
  },
};

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
    if (argv[i] === '--force') args.force = true;
  }
  if (!args.tour) {
    console.error('Usage: generate-docs.mjs --tour <tour-id> [--force]');
    process.exit(1);
  }
  return args;
}

function main() {
  const { tour: tourId, force } = parseArgs(process.argv.slice(2));
  const config = loadConfig('autodocs.config.yaml');
  const tour = loadTour('tours', tourId);

  // Checked before the manifest lookup below (not after) so a draft/
  // proposed tour that's never been captured skips cleanly, matching
  // drift.mjs's CLI and this gate's own doc comments — checking the
  // manifest first would throw a confusing "run capture first" error for a
  // tour the drift gate was never going to regenerate anyway.
  if (tour.maturity === 'draft') {
    console.log(`Skipping "${tour.id}": maturity is "draft" — drift gate never regenerates it.`);
    process.exit(0);
  }
  if (tour.status === 'proposed') {
    console.log(`Skipping "${tour.id}": status is "proposed" — needs human review before it's real.`);
    process.exit(0);
  }
  if (tour.status === 'archived') {
    console.log(`Skipping "${tour.id}": status is "archived" — see docs/archive/${tour.id}.md (run archive-tour.mjs to archive, not this script).`);
    process.exit(0);
  }

  const manifestPath = path.join(config.outputDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);
  const tourManifest = manifest[tour.id];
  if (!tourManifest) {
    throw new Error(`No manifest entry for tour "${tour.id}" — run \`npm run capture -- --tour ${tourId}\` first.`);
  }
  // capture.mjs --continue-on-error can save a manifest entry for a tour
  // whose capture only partially succeeded (some steps/captures failed, see
  // lib/manifest.mjs's buildManifest). Diagnostics only — rendering it here
  // would produce a tutorial silently missing whatever steps failed, with no
  // signal to the reader that anything's wrong. Re-run capture (fix the
  // underlying failure, or drop --continue-on-error) until it succeeds fully.
  if (tourManifest.partial) {
    throw new Error(
      `Manifest entry for tour "${tour.id}" is partial (captured with --continue-on-error and at least one ` +
        `step failure) — re-run \`capture.mjs --tour ${tourId}\` until it succeeds fully before generating ` +
        `its docs. Step failures: ${(tourManifest.stepFailures ?? []).map((f) => `step ${f.index} (${f.message})`).join('; ')}`,
    );
  }

  const missingViewports = findMissingViewports(Object.keys(config.viewports), tourManifest.captures);
  if (missingViewports.length > 0) {
    console.warn(
      `"${tour.id}": configured viewport(s) ${missingViewports.join(', ')} have no captures yet — ` +
        `re-run \`capture.mjs --tour ${tourId}\` to include them. Generating with only the viewports ` +
        `that were captured.`,
    );
  }

  const prosePath = path.join(config.outputDir, 'prose', `${tour.id}.json`);
  const subagentProse = fs.existsSync(prosePath) ? JSON.parse(fs.readFileSync(prosePath, 'utf8')) : {};
  const paragraphs = { ...(PARAGRAPHS[tourId] ?? {}), ...subagentProse };

  const statePath = path.join(config.outputDir, 'state.json');
  const currentScreenshotHashes = flattenScreenshotHashes(tourManifest.captures);
  const currentCodePathsHash = computeCodePathsHash(tour.code_paths);
  const previousEntry = loadState(statePath)[tour.id];

  // docsConfig (autodocs.config.yaml's `docs:` block) picks the primary
  // viewport / whether others collapse; doc-style.json's `page` section (if
  // a design skill was applied — see lib/design.mjs) layers presentation
  // knobs (heading text, viewport labels, figure wrapping) on top. Neither
  // ever touches tour content — see CLAUDE.md's styling scope guardrail.
  const docsConfig = config.docs ?? {};
  const docStyle = loadDocStyle(process.cwd());
  const pageStyle = docStyle.page ?? {};
  const style = { primaryViewport: docsConfig.primaryViewport, collapseOtherViewports: docsConfig.collapseOtherViewports, ...pageStyle };

  // sidebar_position always applies (product pages pin to the top at 1-3,
  // tours start at 10 — see lib/product.mjs's computeTourSidebarPositions),
  // whether or not this project has opted into config.docs.sections at all —
  // grouping is opt-in, ordering isn't. A tour's position depends on every
  // *other* tour's existence/status too, so that sorted inventory feeds
  // currentRenderHash below — adding/removing/renaming a sibling tour has to
  // re-render this one's frontmatter too, not just the tour that changed.
  // This same mechanism is what keeps a prerequisites/see_also cross-link
  // (see lib/product.mjs's resolveTourLinks, used below) from ever going
  // stale: renaming, retitling, or archiving a tour changes tourInventory,
  // which changes every *other* tour's render hash too — including ones
  // that link to it — so the next run re-resolves and re-renders those
  // links against the current inventory rather than leaving a stale title
  // or a dead link for lib/verify.mjs to catch later. tourInventory carries
  // {id, title} pairs (not just ids) specifically because of this — a
  // title-only edit wouldn't otherwise change anything sidebar_position
  // alone cared about. drift.mjs computes this identically; the two must
  // never disagree about what's in it, or its report would drift from what
  // this script actually persists.
  const allTours = fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .map((id) => loadTour('tours', id));
  const tourInventory = allTours
    .filter(isPublishedTour)
    .map((t) => ({ id: t.id, title: t.title ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const currentRenderHash = computeRenderHash({
    templateVersion: RENDER_TEMPLATE_VERSION,
    docsConfig,
    pageStyle,
    tourInventory,
  });

  const dirty = isTourDirty({
    tour,
    previousEntry,
    currentScreenshotHashes,
    currentCodePathsHash,
    currentRenderHash,
  });

  if (!dirty) {
    console.log(`"${tour.id}" is unchanged since the last generation — skipping.`);
    process.exit(0);
  }

  const pixelDiffThreshold = config.pixelDiffThreshold ?? 0.005;
  const imagesDir = path.join('docs', 'images', tour.id);
  const diffsDir = path.join(config.outputDir, 'diffs', tour.id);
  fs.mkdirSync(imagesDir, { recursive: true });

  const steps = tour.steps
    .filter((step) => step.capture)
    .map((step) => {
      const captureEntry = tourManifest.captures.find((c) => c.name === step.capture);
      if (!captureEntry) {
        throw new Error(`Manifest is missing capture "${step.capture}" for tour "${tour.id}"`);
      }
      const paragraph = paragraphs[step.capture];
      if (!paragraph) {
        throw new Error(`No grounded paragraph authored for capture "${step.capture}"`);
      }

      const images = Object.entries(captureEntry.viewports).map(([viewportName, v]) => {
        const newCapturePath = path.join(config.outputDir, v.png);
        const destPath = path.join(imagesDir, `${step.capture}@${viewportName}.png`);
        const diffRatio = pixelDiffRatio(destPath, newCapturePath);
        if (diffRatio >= pixelDiffThreshold) {
          // Snapshot the outgoing image + a visual diff *before* overwriting,
          // so `npm run review-diffs` has something to show — skip this on the
          // very first capture, when there's nothing to diff against yet.
          if (fs.existsSync(destPath)) {
            const beforePath = path.join(diffsDir, `${step.capture}@${viewportName}.before.png`);
            fs.mkdirSync(diffsDir, { recursive: true });
            fs.copyFileSync(destPath, beforePath);
            const diffPath = path.join(diffsDir, `${step.capture}@${viewportName}.diff.png`);
            writeDiffImage(beforePath, newCapturePath, diffPath);
          }
          fs.copyFileSync(newCapturePath, destPath);
        } else {
          console.log(
            `  - ${step.capture}@${viewportName}: pixel diff ${(diffRatio * 100).toFixed(3)}% below threshold, keeping committed image`,
          );
        }
        return { viewport: viewportName, path: path.relative('docs', destPath) };
      });

      return {
        description: step.description,
        images,
        paragraph,
      };
    });

  // sidebar_label only when the tour actually has a title — loadTour doesn't
  // require one. generatedAt/generatedAtCommit are computed once here and
  // reused for both the (opt-in) frontmatter stamp below and the state.json
  // entry saved further down — one source of truth for "when was this last
  // generated" (see lib/product.mjs's buildFrontmatter and lib/status.mjs).
  const sidebarPositions = computeTourSidebarPositions({ sections: config.docs?.sections, tours: allTours });
  const generatedAt = new Date().toISOString();
  const generatedAtCommit = resolveShortHeadCommit();
  const frontmatter = buildFrontmatter({
    sidebarPosition: sidebarPositions.get(tour.id),
    sidebarLabel: tour.title,
    lastVerified: docsConfig.stampVerified ? `${generatedAt.slice(0, 10)} (${generatedAtCommit})` : undefined,
  });

  const newMarkdown = renderTourPage({
    title: tour.title,
    intent: tour.intent ?? '',
    steps,
    style,
    frontmatter,
    prerequisites: resolveTourLinks(tour.prerequisites, allTours),
    seeAlso: resolveTourLinks(tour.see_also, allTours),
  });

  const docPath = path.join('docs', `${tour.id}.md`);
  const previousMarkdown = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : undefined;

  // If a human edited the page outside its keep-region since the last
  // generation, warn loudly instead of silently clobbering their edit — the
  // keep-region only protects content inside it, not the rest of the page.
  if (previousMarkdown !== undefined && previousEntry?.bodyHash) {
    const currentBodyHash = sha256Buffer(Buffer.from(nonKeepContent(previousMarkdown)));
    if (currentBodyHash !== previousEntry.bodyHash) {
      if (!force) {
        console.error(
          `"${tour.id}": ${docPath} was edited outside its <!-- autodocs:keep --> region since the ` +
            `last generation. Move the edit into the keep-region, or re-run with --force to overwrite it.`,
        );
        process.exit(1);
      }
      console.warn(`"${tour.id}": overwriting an edit made outside the keep-region (--force).`);
    }
  }

  const finalMarkdown = applyKeepRegion(newMarkdown, previousMarkdown);

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(docPath, finalMarkdown);
  // saveTourState replaces this tour's whole state.json entry, not just
  // these fields — carry forward capture.mjs's own lastCaptureError/
  // consecutiveFailures (see lib/state.mjs's recordCaptureResult) instead of
  // silently dropping them here. Generating docs from an existing manifest
  // doesn't mean the *next* capture attempt succeeded; if a later capture
  // for this tour genuinely failed after this manifest was recorded, that's
  // still worth `/document status` surfacing even though the page rendered
  // fine from older, still-good data.
  saveTourState(statePath, tour.id, {
    screenshotHashes: currentScreenshotHashes,
    codePathsHash: currentCodePathsHash,
    bodyHash: sha256Buffer(Buffer.from(nonKeepContent(finalMarkdown))),
    renderHash: currentRenderHash,
    generatedAt,
    generatedAtCommit,
    lastCaptureError: previousEntry?.lastCaptureError ?? null,
    consecutiveFailures: previousEntry?.consecutiveFailures ?? 0,
  });

  console.log(`Generated ${docPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
