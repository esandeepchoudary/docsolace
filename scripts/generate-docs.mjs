// Phase 2: assembles docs/<tour-id>.md from a tour's captures (screenshots +
// a11y snapshots) via scripts/lib/docgen.mjs. The PARAGRAPHS below are
// authored prose, grounded strictly in each capture's a11y snapshot — Phase 4
// replaces this hardcoded map with the doc-scribe subagent, which does the
// same grounding automatically for whichever tours the drift gate marks dirty.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { applyKeepRegion, renderTourPage } from './lib/docgen.mjs';

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

const paragraphs = PARAGRAPHS[tourId];
if (!paragraphs) {
  throw new Error(`No grounded paragraphs authored for tour "${tourId}" in PARAGRAPHS map.`);
}

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

    const destPath = path.join(imagesDir, `${step.capture}.png`);
    fs.copyFileSync(path.join(config.outputDir, captureEntry.png), destPath);

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

console.log(`Generated ${docPath}`);
