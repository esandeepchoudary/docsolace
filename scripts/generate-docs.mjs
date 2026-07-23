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
import { applyKeepRegion, renderTourPage } from './lib/docgen.mjs';
import { computeCodePathsHash, isTourDirty } from './lib/drift.mjs';
import { loadState, saveTourState } from './lib/state.mjs';
import { pixelDiffRatio } from './lib/pixel-diff.mjs';

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
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
  }
  if (!args.tour) {
    console.error('Usage: generate-docs.mjs --tour <tour-id>');
    process.exit(1);
  }
  return args;
}

const { tour: tourId } = parseArgs(process.argv.slice(2));
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
const currentScreenshotHashes = Object.fromEntries(
  tourManifest.captures.map((c) => [c.name, c.sha256]),
);
const currentCodePathsHash = computeCodePathsHash(tour.code_paths);
const previousEntry = loadState(statePath)[tour.id];

if (tour.maturity === 'draft') {
  console.log(`Skipping "${tour.id}": maturity is "draft" — drift gate never regenerates it.`);
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

    const newCapturePath = path.join(config.outputDir, captureEntry.png);
    const destPath = path.join(imagesDir, `${step.capture}.png`);
    const diffRatio = pixelDiffRatio(destPath, newCapturePath);
    if (diffRatio >= pixelDiffThreshold) {
      fs.copyFileSync(newCapturePath, destPath);
    } else {
      console.log(`  - ${step.capture}: pixel diff ${(diffRatio * 100).toFixed(3)}% below threshold, keeping committed image`);
    }

    return {
      description: step.description,
      imagePath: path.relative('docs', destPath),
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
const finalMarkdown = applyKeepRegion(newMarkdown, previousMarkdown);

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(docPath, finalMarkdown);
saveTourState(statePath, tour.id, {
  screenshotHashes: currentScreenshotHashes,
  codePathsHash: currentCodePathsHash,
});

console.log(`Generated ${docPath}`);
