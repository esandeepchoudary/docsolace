// Reports which tours are dirty (need regeneration) without mutating
// anything. `generate-docs.mjs` performs the same check per tour and is what
// actually advances the state after a successful regeneration.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { flattenScreenshotHashes, loadManifest } from './lib/manifest.mjs';
import { computeCodePathsHash, getDirtyReasons, isRenderOnlyDirty, resolveChangedCodePaths } from './lib/drift.mjs';
import { computeRenderHash, loadDocStyle } from './lib/design.mjs';
import { RENDER_TEMPLATE_VERSION } from './lib/docgen.mjs';
import { loadState } from './lib/state.mjs';
import {
  PRODUCT_PAGE_IDS,
  PRODUCT_STATE_KEY,
  buildTourInventory,
  collectProductSources,
  computeProductInputsHash,
  getProductDirtyReasons,
  isProductRenderOnlyDirty,
  resolveChangelogGitTags,
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
  // lib/product.mjs's shared builder — must match generate-docs.mjs's/
  // status.mjs's own tourInventory exactly, or this report would disagree
  // with what a real run actually persists.
  const tourInventory = buildTourInventory(allTours);

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
    let suffix = '';
    if (dirty) {
      if (isRenderOnlyDirty(reasons)) {
        suffix = ' (render only — no new prose needed)';
      } else {
        suffix = ` (${reasons.join(', ')})`;
        // Mechanical, not a summary: exactly which of this tour's own
        // code_paths differ from the commit it was last generated against
        // (see lib/drift.mjs's resolveChangedCodePaths) — folded into the
        // /document skill's Step 5 run summary, which becomes the PR body,
        // so a reviewer sees *which* file(s) triggered a regeneration
        // instead of just "code changed". Silently omitted (not an error)
        // when there's no previous generation to diff against.
        if (reasons.includes('code')) {
          const changedFiles = resolveChangedCodePaths({
            codePaths: tour.code_paths,
            sinceCommit: previousEntry?.generatedAtCommit,
          });
          if (changedFiles.length > 0) {
            suffix += ` [code: ${changedFiles.join(', ')}]`;
          }
        }
      }
    }
    console.log(`  ${dirty ? 'dirty  ' : 'clean  '} ${tour.id}${suffix}`);
  }

  // Product pages (overview/getting-started/concepts) — same drift-hash
  // shape as tours above, gated on grounding-file/tour-inventory inputs
  // instead of screenshots (see lib/product.mjs). Skipped entirely when a
  // project has disabled every page via config.product.pages.
  const enabledProductPages = config.product?.pages ?? PRODUCT_PAGE_IDS;
  if (enabledProductPages.length > 0) {
    const sourceFiles = collectProductSources(process.cwd(), config);
    const gitTags = resolveChangelogGitTags({ cwd: process.cwd(), enabledPageIds: enabledProductPages });
    const currentInputsHash = computeProductInputsHash({ cwd: process.cwd(), sourceFiles, tours: allTours, gitTags });
    const previousProductEntry = state[PRODUCT_STATE_KEY];
    const productReasons = getProductDirtyReasons({
      previousEntry: previousProductEntry,
      currentInputsHash,
      currentRenderHash: currentProductRenderHash,
    });
    const productDirty = productReasons.length > 0;
    if (productDirty) anyDirty = true;

    const prosePath = path.join(config.outputDir, 'prose', '_product.json');
    let productSuffix = '';
    if (productDirty) {
      if (isProductRenderOnlyDirty(productReasons)) {
        productSuffix = ' (render only — no new prose needed)';
      } else if (!fs.existsSync(prosePath)) {
        productSuffix = ' (needs product-scribe — see /document product)';
      } else {
        productSuffix = ` (${productReasons.join(', ')})`;
        // Same mechanical "which file(s), not just that inputs changed"
        // detail as the tour loop above — sourceFiles are already resolved
        // concrete paths (not glob patterns), which resolveChangedCodePaths
        // handles the same way either way. Unlike a tour's own state entry,
        // generatedAtCommit lives per-page here (state.json's
        // `_product.pages.<id>.generatedAtCommit` — see
        // generate-product-docs.mjs), since each page could in principle
        // regenerate on its own; every page from the same run shares the
        // same value in practice, so any one page's is representative.
        if (productReasons.includes('inputs')) {
          const anyPageEntry = Object.values(previousProductEntry?.pages ?? {})[0];
          const changedFiles = resolveChangedCodePaths({
            codePaths: sourceFiles,
            sinceCommit: anyPageEntry?.generatedAtCommit,
          });
          if (changedFiles.length > 0) {
            productSuffix += ` [changed: ${changedFiles.join(', ')}]`;
          }
        }
      }
    }
    console.log(`  ${productDirty ? 'dirty  ' : 'clean  '} _product (overview/getting-started/concepts)${productSuffix}`);
  }

  process.exit(anyDirty ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
