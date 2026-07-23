// Reports which tours are dirty (need regeneration) without mutating
// anything. `generate-docs.mjs` performs the same check per tour and is what
// actually advances the state after a successful regeneration.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { flattenScreenshotHashes } from './lib/manifest.mjs';
import { computeCodePathsHash, isTourDirty } from './lib/drift.mjs';
import { loadState } from './lib/state.mjs';

const config = loadConfig('autodocs.config.yaml');
const statePath = path.join(config.outputDir, 'state.json');
const state = loadState(statePath);

const manifestPath = path.join(config.outputDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

const tourIds = fs
  .readdirSync('tours')
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => f.replace(/\.yaml$/, ''));

let anyDirty = false;

for (const fileId of tourIds) {
  const tour = loadTour('tours', fileId);

  if (tour.maturity === 'draft') {
    console.log(`  draft    ${tour.id} (skipped by the gate)`);
    continue;
  }
  if (tour.status === 'proposed') {
    console.log(`  proposed ${tour.id} (awaiting human review — see Phase 7 in the brief)`);
    continue;
  }

  const tourManifest = manifest[tour.id];
  if (!tourManifest) {
    console.log(`  ?       ${tour.id} (no capture yet — run \`npm run capture -- --tour ${fileId}\`)`);
    continue;
  }

  const currentScreenshotHashes = flattenScreenshotHashes(tourManifest.captures);
  const currentCodePathsHash = computeCodePathsHash(tour.code_paths);
  const previousEntry = state[tour.id];

  const dirty = isTourDirty({ tour, previousEntry, currentScreenshotHashes, currentCodePathsHash });
  if (dirty) anyDirty = true;
  console.log(`  ${dirty ? 'dirty  ' : 'clean  '} ${tour.id}`);
}

process.exit(anyDirty ? 1 : 0);
