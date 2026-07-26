// Read-only status report: which tours/product pages are dirty, clean, or
// gated (draft/proposed/archived/uncaptured), whether each has a generated
// page yet, and when it was last generated. No browser, no subagent — just
// tours/, docs/, and .autodocs/artifacts/{manifest,state}.json already on
// disk. Unlike drift.mjs (a CI-style gate that exits 1 when anything's
// dirty), this always exits 0 — it's a report, not a check.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { computeRenderHash, loadDocStyle } from './lib/design.mjs';
import { RENDER_TEMPLATE_VERSION } from './lib/docgen.mjs';
import { loadState } from './lib/state.mjs';
import { computeTourStatus, computeProductPageStatus, findAnomalies } from './lib/status.mjs';
import {
  PRODUCT_PAGE_IDS,
  PRODUCT_STATE_KEY,
  buildTourInventory,
  collectProductSources,
  computeProductInputsHash,
  getProductDirtyReasons,
  resolveChangelogGitTags,
} from './lib/product.mjs';

function formatGenerated({ generatedAt, generatedAtCommit, hasPage }) {
  if (generatedAt) {
    const date = generatedAt.slice(0, 10);
    return `generated ${date}${generatedAtCommit ? ` (commit ${generatedAtCommit})` : ''}`;
  }
  // A page can exist with no generatedAt on its state entry — it was written
  // by a version of generate-docs.mjs/generate-product-docs.mjs that
  // predates this field (every state.json committed before this feature
  // shipped). Distinct from a genuinely never-generated page, which has no
  // state entry — or no page — at all.
  return hasPage ? 'generated at an unknown time (predates freshness tracking)' : 'never generated';
}

function printTourLine(status) {
  const { id, gate, dirty, reasons, renderOnly } = status;
  if (gate === 'draft') return console.log(`  draft    ${id} (skipped by the gate)`);
  if (gate === 'proposed') return console.log(`  proposed ${id} (awaiting human review)`);
  if (gate === 'archived') return console.log(`  archived ${id} (docs/archive/${id}.md)`);
  if (gate === 'uncaptured') return console.log(`  ?        ${id} (no capture yet)`);

  const suffix = dirty
    ? renderOnly
      ? ' (render only — no new prose needed)'
      : ` (${reasons.join(', ')})`
    : '';
  console.log(`  ${dirty ? 'dirty  ' : 'clean  '} ${id}${suffix} — ${formatGenerated(status)}`);
}

function main() {
  const config = loadConfig('autodocs.config.yaml');
  const statePath = path.join(config.outputDir, 'state.json');
  const state = loadState(statePath);
  const manifestPath = path.join(config.outputDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);

  if (!fs.existsSync('tours')) {
    console.log('No tours/ directory yet — run /autodocs:document once to bootstrap this project.');
    return;
  }

  const tourIds = fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));
  const allTours = tourIds.map((fileId) => loadTour('tours', fileId));
  // lib/product.mjs's shared builder — must match generate-docs.mjs's/
  // drift.mjs's own tourInventory exactly. This used to be computed inline
  // here as a plain ids-only array; centralizing it fixed a real bug where
  // it silently drifted out of sync with the {id, title} shape the other
  // two use, making this report permanently show every published tour as
  // "dirty (render)" even immediately after a genuinely clean generation.
  const tourInventory = buildTourInventory(allTours);

  // Same docsConfig/pageStyle/render-hash computation generate-docs.mjs and
  // drift.mjs's CLI both use — see their own comments on why this can't be
  // one shared hash across tours vs. product pages.
  const docsConfig = config.docs ?? {};
  const pageStyle = loadDocStyle(process.cwd()).page ?? {};
  const currentTourRenderHash = computeRenderHash({
    templateVersion: RENDER_TEMPLATE_VERSION,
    docsConfig,
    pageStyle,
    tourInventory,
  });
  const currentProductRenderHash = computeRenderHash({ templateVersion: RENDER_TEMPLATE_VERSION, docsConfig, pageStyle });

  console.log('Tours:');
  const totals = { dirty: 0, clean: 0, draft: 0, proposed: 0, archived: 0, uncaptured: 0 };
  for (const tour of allTours) {
    const status = computeTourStatus({
      tour,
      tourManifest: manifest[tour.id],
      previousEntry: state[tour.id],
      currentRenderHash: currentTourRenderHash,
    });
    printTourLine(status);
    if (status.gate !== 'active') totals[status.gate] += 1;
    else totals[status.dirty ? 'dirty' : 'clean'] += 1;
  }
  if (allTours.length === 0) console.log('  (none yet)');

  const enabledPageIds = config.product?.pages ?? PRODUCT_PAGE_IDS;
  const enabledPages = PRODUCT_PAGE_IDS.filter((id) => enabledPageIds.includes(id)).map((id) => ({ id }));
  if (enabledPages.length > 0) {
    console.log('\nProduct pages:');
    const sourceFiles = collectProductSources(process.cwd(), config);
    // Must match drift.mjs/generate-product-docs.mjs's own inputsHash
    // computation exactly, gitTags included — omitting it here would make
    // this report permanently disagree with a real run's actual clean/dirty
    // determination on any project with the changelog page enabled (the
    // default) and no CHANGELOG.md (the common case), not just on an actual
    // tag change. Confirmed as a real, always-reproducible bug against this
    // repo's own state before this fix, not a hypothetical.
    const gitTags = resolveChangelogGitTags({ cwd: process.cwd(), enabledPageIds });
    const currentInputsHash = computeProductInputsHash({ cwd: process.cwd(), sourceFiles, tours: allTours, gitTags });
    const previousProductEntry = state[PRODUCT_STATE_KEY];
    const productReasons = getProductDirtyReasons({
      previousEntry: previousProductEntry,
      currentInputsHash,
      currentRenderHash: currentProductRenderHash,
    });
    const productDirty = productReasons.length > 0;

    for (const page of enabledPages) {
      const status = computeProductPageStatus({ page, previousEntry: previousProductEntry, productDirty, productReasons });
      const suffix = status.dirty
        ? status.renderOnly
          ? ' (render only — no new prose needed)'
          : ` (${status.reasons.join(', ')})`
        : '';
      console.log(`  ${status.dirty ? 'dirty  ' : 'clean  '} ${status.id}${suffix} — ${formatGenerated(status)}`);
      totals[status.dirty ? 'dirty' : 'clean'] += 1;
    }
  }

  console.log(
    `\nTotals: ${totals.dirty} dirty, ${totals.clean} clean, ${totals.draft} draft, ${totals.proposed} proposed, ` +
      `${totals.archived} archived, ${totals.uncaptured} uncaptured`,
  );

  const anomalies = findAnomalies({ tours: allTours, productPageIds: enabledPageIds });
  if (anomalies.length > 0) {
    console.log('\nAnomalies:');
    for (const message of anomalies) console.log(`  - ${message}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
