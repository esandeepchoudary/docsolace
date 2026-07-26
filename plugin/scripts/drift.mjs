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
import {
  PRODUCT_PAGE_IDS,
  PRODUCT_STATE_KEY,
  collectProductSources,
  computeProductInputsHash,
  getProductDirtyReasons,
  isProductRenderOnlyDirty,
  isPublishedTour,
} from './lib/product.mjs';

function main() {
  const config = loadConfig('autodocs.config.yaml');
  const statePath = path.join(config.outputDir, 'state.json');
  const state = loadState(statePath);

  const manifestPath = path.join(config.outputDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);

  // Same guard validate.mjs already has — without it, a missing tours/
  // (e.g. this is run before /autodocs:document has ever bootstrapped the
  // project) surfaces as a raw ENOENT from readdirSync instead of a
  // friendly, actionable message.
  if (!fs.existsSync('tours')) {
    console.log('No tours/ directory yet — run /autodocs:document once to bootstrap this project.');
    return;
  }

  const tourIds = fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));

  // Loaded upfront (not per-iteration) — the product pages' tour index/
  // inputs hash and each tour's own sidebar_position both need the whole
  // inventory (see lib/product.mjs's computeProductInputsHash/
  // computeTourSidebarPositions/isPublishedTour), regardless of that tour's
  // own maturity/status, same as generate-product-docs.mjs's loadAllTours.
  const allTours = tourIds.map((fileId) => loadTour('tours', fileId));
  // {id, title} pairs, not just ids — must match generate-docs.mjs's own
  // tourInventory exactly (see its comment): a title-only edit has to be
  // part of this hash too, since a prerequisites/see_also cross-link
  // renders the target's title, not just its id.
  const tourInventory = allTours
    .filter(isPublishedTour)
    .map((t) => ({ id: t.id, title: t.title ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Same docsConfig/pageStyle/render-hash computation generate-docs.mjs
  // does, so this report and the actual regeneration never disagree about
  // what counts as dirty (see lib/design.mjs's computeRenderHash). Two
  // distinct hashes, not one shared value: a tour's render hash includes
  // tourInventory (its sidebar_position depends on every sibling tour), but
  // generate-product-docs.mjs's own render hash for the product pages does
  // not (their position is fixed — see lib/product.mjs's PRODUCT_PAGES) —
  // sharing one hash across both would make this report disagree with
  // whichever of the two scripts actually persists it.
  const docsConfig = config.docs ?? {};
  const pageStyle = loadDocStyle(process.cwd()).page ?? {};
  const currentTourRenderHash = computeRenderHash({
    templateVersion: RENDER_TEMPLATE_VERSION,
    docsConfig,
    pageStyle,
    tourInventory,
  });
  const currentProductRenderHash = computeRenderHash({
    templateVersion: RENDER_TEMPLATE_VERSION,
    docsConfig,
    pageStyle,
  });

  let anyDirty = false;

  for (const [index, fileId] of tourIds.entries()) {
    const tour = allTours[index];

    if (tour.maturity === 'draft') {
      console.log(`  draft    ${tour.id} (skipped by the gate)`);
      continue;
    }
    if (tour.status === 'proposed') {
      console.log(`  proposed ${tour.id} (awaiting human review — see Phase 7 in the brief)`);
      continue;
    }
    if (tour.status === 'archived') {
      console.log(`  archived ${tour.id} (docs/archive/${fileId}.md — no longer captured or regenerated)`);
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

    const reasons = getDirtyReasons({
      previousEntry,
      currentScreenshotHashes,
      currentCodePathsHash,
      currentRenderHash: currentTourRenderHash,
    });
    const dirty = reasons.length > 0;
    if (dirty) anyDirty = true;
    // Flag render-only dirtiness explicitly — the /document skill's Step 3
    // skips dispatching the doc-scribe subagent for these (the existing
    // prose is still grounded; only the layout/style changed), and only
    // needs to re-run generate-docs.mjs to pick up the new template.
    const suffix = dirty ? (isRenderOnlyDirty(reasons) ? ' (render only — no new prose needed)' : ` (${reasons.join(', ')})`) : '';
    console.log(`  ${dirty ? 'dirty  ' : 'clean  '} ${tour.id}${suffix}`);
  }

  // Product pages (overview/getting-started/concepts) — same drift-hash
  // shape as tours above, gated on grounding-file/tour-inventory inputs
  // instead of screenshots (see lib/product.mjs). Skipped entirely when a
  // project has disabled every page via config.product.pages.
  const enabledProductPages = config.product?.pages ?? PRODUCT_PAGE_IDS;
  if (enabledProductPages.length > 0) {
    const sourceFiles = collectProductSources(process.cwd(), config);
    const currentInputsHash = computeProductInputsHash({ cwd: process.cwd(), sourceFiles, tours: allTours });
    const previousProductEntry = state[PRODUCT_STATE_KEY];
    const productReasons = getProductDirtyReasons({
      previousEntry: previousProductEntry,
      currentInputsHash,
      currentRenderHash: currentProductRenderHash,
    });
    const productDirty = productReasons.length > 0;
    if (productDirty) anyDirty = true;

    const prosePath = path.join(config.outputDir, 'prose', '_product.json');
    let suffix = '';
    if (productDirty) {
      if (isProductRenderOnlyDirty(productReasons)) {
        suffix = ' (render only — no new prose needed)';
      } else if (!fs.existsSync(prosePath)) {
        suffix = ' (needs product-scribe — see /document product)';
      } else {
        suffix = ` (${productReasons.join(', ')})`;
      }
    }
    console.log(`  ${productDirty ? 'dirty  ' : 'clean  '} _product (overview/getting-started/concepts)${suffix}`);
  }

  process.exit(anyDirty ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
