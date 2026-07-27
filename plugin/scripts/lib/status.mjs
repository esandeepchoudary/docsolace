// Pure helpers behind `/document status` / status.mjs: a read-only report of
// every tour's and product page's dirty/clean state, whether its page exists
// on disk, and when it was last generated — no browser, no subagent, just
// tours/, docs/, and .docsolace/artifacts/{manifest,state}.json already on
// disk. Reuses the exact lib/drift.mjs (getDirtyReasons/isRenderOnlyDirty/
// computeCodePathsHash) + lib/manifest.mjs (flattenScreenshotHashes)
// computation generate-docs.mjs/drift.mjs already call with the same
// inputs, so this report can never disagree with what a real run would do —
// see scripts/status.mjs for how the caller assembles those same inputs
// (config, manifest, state) before calling into here.
import fs from 'node:fs';
import path from 'node:path';
import { computeCodePathsHash, getDirtyReasons, isRenderOnlyDirty } from './drift.mjs';
import { flattenScreenshotHashes } from './manifest.mjs';
import { isPublishedTour } from './product.mjs';

// One tour's status: which gate (if any) skips it, whether it's dirty and
// why, whether its page exists on disk yet, and when it was last generated
// (from its state.json entry's generatedAt/generatedAtCommit — see
// generate-docs.mjs). `tourManifest`/`previousEntry` are the same
// manifest.json/state.json entries generate-docs.mjs itself reads.
export function computeTourStatus({ tour, tourManifest, previousEntry, currentRenderHash, cwd = process.cwd(), docsDir = 'docs' }) {
  const base = {
    id: tour.id,
    status: tour.status ?? 'confirmed',
    maturity: tour.maturity ?? 'stable',
    hasPage: fs.existsSync(path.join(docsDir, `${tour.id}.md`)),
    generatedAt: previousEntry?.generatedAt ?? null,
    generatedAtCommit: previousEntry?.generatedAtCommit ?? null,
  };

  // Same three gates isTourDirty/generate-docs.mjs/capture.mjs already skip —
  // none of these are ever "dirty" in the sense of needing a real run.
  if (tour.maturity === 'draft') return { ...base, gate: 'draft', dirty: false, reasons: [] };
  if (tour.status === 'proposed') return { ...base, gate: 'proposed', dirty: false, reasons: [] };
  if (tour.status === 'archived') return { ...base, gate: 'archived', dirty: false, reasons: [] };

  if (!tourManifest) {
    return { ...base, gate: 'uncaptured', dirty: true, reasons: ['never-captured'] };
  }

  const currentScreenshotHashes = flattenScreenshotHashes(tourManifest.captures);
  const currentCodePathsHash = computeCodePathsHash(tour.code_paths, cwd);
  const reasons = getDirtyReasons({ previousEntry, currentScreenshotHashes, currentCodePathsHash, currentRenderHash });
  const dirty = reasons.length > 0;

  return { ...base, gate: 'active', dirty, reasons, renderOnly: dirty && isRenderOnlyDirty(reasons) };
}

// One product page's status. Product state tracks one shared inputsHash/
// renderHash across every enabled page (lib/product.mjs's
// getProductDirtyReasons) — `productReasons`/`productDirty` are computed
// once by the caller (scripts/status.mjs) from that shared pair and passed
// in here, so every page in the same run reports the same dirty reason; this
// function only adds the per-page bits state.json already tracks
// independently (hasPage, generatedAt/generatedAtCommit — see
// generate-product-docs.mjs's per-page pages[id] entry).
export function computeProductPageStatus({ page, previousEntry, productDirty, productReasons, docsDir = 'docs' }) {
  const pageEntry = previousEntry?.pages?.[page.id];
  return {
    id: page.id,
    hasPage: fs.existsSync(path.join(docsDir, `${page.id}.md`)),
    generatedAt: pageEntry?.generatedAt ?? null,
    generatedAtCommit: pageEntry?.generatedAtCommit ?? null,
    dirty: productDirty,
    reasons: productReasons,
    renderOnly: productDirty && isRenderOnlyDirty(productReasons),
  };
}

// Anomalies a clean dirty/clean report wouldn't surface on its own: a
// confirmed, stable tour (would get a real page — see lib/product.mjs's
// isPublishedTour) that doesn't have one yet, and a top-level docs/*.md file
// that matches neither a real tour id nor a product page id — most likely a
// hand-created page, or a leftover from a tour that was renamed/deleted
// without going through archive-tour.mjs. Both are purely mechanical checks,
// no framework-routing judgment call (same "mechanical, not a judgment call"
// posture as lib/prune.mjs's findOrphanTours).
export function findAnomalies({ tours, productPageIds, docsDir = 'docs' }) {
  const anomalies = [];

  for (const tour of tours) {
    if (isPublishedTour(tour) && !fs.existsSync(path.join(docsDir, `${tour.id}.md`))) {
      anomalies.push(
        `tour "${tour.id}" is confirmed/stable but has no generated page yet — run \`/document ${tour.id}\`.`,
      );
    }
  }

  if (fs.existsSync(docsDir)) {
    const tourIds = new Set(tours.map((t) => t.id));
    const knownIds = new Set([...tourIds, ...productPageIds]);
    for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const id = entry.name.replace(/\.md$/, '');
      if (!knownIds.has(id)) {
        anomalies.push(`"docs/${entry.name}" exists but matches no tour under tours/ or enabled product page.`);
      }
    }
  }

  return anomalies;
}
