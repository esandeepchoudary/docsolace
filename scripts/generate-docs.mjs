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
import { applyKeepRegion, nonKeepContent, renderTourPage } from './lib/docgen.mjs';
import { flattenScreenshotHashes, sha256Buffer } from './lib/manifest.mjs';
import { computeCodePathsHash, isTourDirty } from './lib/drift.mjs';
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

const { tour: tourId, force } = parseArgs(process.argv.slice(2));
const config = loadConfig('autodocs.config.yaml');
const tour = loadTour('tours', tourId);

const manifestPath = path.join(config.outputDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tourManifest = manifest[tour.id];
if (!tourManifest) {
  throw new Error(`No manifest entry for tour "${tour.id}" — run \`npm run capture -- --tour ${tourId}\` first.`);
}

const prosePath = path.join(config.outputDir, 'prose', `${tour.id}.json`);
const subagentProse = fs.existsSync(prosePath) ? JSON.parse(fs.readFileSync(prosePath, 'utf8')) : {};
const paragraphs = { ...(PARAGRAPHS[tourId] ?? {}), ...subagentProse };

const statePath = path.join(config.outputDir, 'state.json');
const currentScreenshotHashes = flattenScreenshotHashes(tourManifest.captures);
const currentCodePathsHash = computeCodePathsHash(tour.code_paths);
const previousEntry = loadState(statePath)[tour.id];

if (tour.maturity === 'draft') {
  console.log(`Skipping "${tour.id}": maturity is "draft" — drift gate never regenerates it.`);
  process.exit(0);
}
if (tour.status === 'proposed') {
  console.log(`Skipping "${tour.id}": status is "proposed" — needs human review before it's real.`);
  process.exit(0);
}

const dirty = isTourDirty({
  tour,
  previousEntry,
  currentScreenshotHashes,
  currentCodePathsHash,
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

const newMarkdown = renderTourPage({
  title: tour.title,
  intent: tour.intent ?? '',
  steps,
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
saveTourState(statePath, tour.id, {
  screenshotHashes: currentScreenshotHashes,
  codePathsHash: currentCodePathsHash,
  bodyHash: sha256Buffer(Buffer.from(nonKeepContent(finalMarkdown))),
});

console.log(`Generated ${docPath}`);
