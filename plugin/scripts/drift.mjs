// Reports which tours are dirty (need regeneration) without mutating
// anything. `generate-docs.mjs` performs the same check per tour and is what
// actually advances the state after a successful regeneration.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { flattenScreenshotHashes, loadManifest } from './lib/manifest.mjs';
import { computeCodePathsHash, getDirtyReasons, isRenderOnlyDirty } from './lib/drift.mjs';
import { computeRenderHash, loadDocStyle } from './lib/design.mjs';
import { RENDER_TEMPLATE_VERSION } from './lib/docgen.mjs';
import { loadState } from './lib/state.mjs';

function main() {
  const config = loadConfig('autodocs.config.yaml');
  const statePath = path.join(config.outputDir, 'state.json');
  const state = loadState(statePath);

  const manifestPath = path.join(config.outputDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);

  const tourIds = fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));

  // Same docsConfig/pageStyle/render-hash computation generate-docs.mjs
  // does, so this report and the actual regeneration never disagree about
  // what counts as dirty (see lib/design.mjs's computeRenderHash).
  const docsConfig = config.docs ?? {};
  const pageStyle = loadDocStyle(process.cwd()).page ?? {};
  const currentRenderHash = computeRenderHash({ templateVersion: RENDER_TEMPLATE_VERSION, docsConfig, pageStyle });

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

    const reasons = getDirtyReasons({ previousEntry, currentScreenshotHashes, currentCodePathsHash, currentRenderHash });
    const dirty = reasons.length > 0;
    if (dirty) anyDirty = true;
    // Flag render-only dirtiness explicitly — the /document skill's Step 3
    // skips dispatching the doc-scribe subagent for these (the existing
    // prose is still grounded; only the layout/style changed), and only
    // needs to re-run generate-docs.mjs to pick up the new template.
    const suffix = dirty ? (isRenderOnlyDirty(reasons) ? ' (render only — no new prose needed)' : ` (${reasons.join(', ')})`) : '';
    console.log(`  ${dirty ? 'dirty  ' : 'clean  '} ${tour.id}${suffix}`);
  }

  process.exit(anyDirty ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
