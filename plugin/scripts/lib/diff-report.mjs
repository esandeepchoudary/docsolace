import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Scans <outputDir>/diffs/<tourId>/ (written by generate-docs.mjs whenever
// the pixel-diff gate decides to update a committed screenshot) for pending
// changes to review.
//
// Enumerates by `*.before.png`, not `*.diff.png`. writeDiffImage (see
// lib/pixel-diff.mjs) writes no .diff.png when a capture's *dimensions*
// changed (nothing to visualize pixel-for-pixel) — but pixelDiffRatio still
// treats a dimension change as maximally different, so generate-docs.mjs
// still commits the new image and still writes .before.png. Enumerating by
// .diff.png alone silently dropped exactly that change — the one most
// likely to be a real visual regression — from the review report entirely.
// Treating the diff image as optional here means every committed change
// shows up for review, with or without a pixel-diff visualization.
export function collectDiffEntries({ diffsRoot, outputDir }) {
  const entries = [];
  if (!fs.existsSync(diffsRoot)) return entries;

  for (const tourId of fs.readdirSync(diffsRoot)) {
    const tourDiffDir = path.join(diffsRoot, tourId);
    if (!fs.statSync(tourDiffDir).isDirectory()) continue;

    for (const file of fs.readdirSync(tourDiffDir)) {
      if (!file.endsWith('.before.png')) continue;
      const captureAtViewport = file.replace(/\.before\.png$/, '');
      const [capture, viewport] = captureAtViewport.split('@');

      const beforePath = path.join(tourDiffDir, file);
      const afterPath = path.join('docs', 'images', tourId, `${captureAtViewport}.png`);
      if (!fs.existsSync(afterPath)) continue;

      const diffCandidate = path.join(tourDiffDir, `${captureAtViewport}.diff.png`);
      const hasDiff = fs.existsSync(diffCandidate);

      entries.push({
        tourId,
        capture,
        viewport,
        beforePath: path.relative(outputDir, beforePath),
        afterPath: path.relative(outputDir, afterPath),
        diffPath: hasDiff ? path.relative(outputDir, diffCandidate) : null,
      });
    }
  }

  return entries;
}

// Renders a single static HTML page for reviewing screenshot changes before
// they're pushed: before/after/diff side by side per changed capture.
// `entries`: [{ tourId, capture, viewport, beforePath, afterPath, diffPath }]
// paths are relative to wherever the report file itself is written, so they
// resolve as plain <img src> without a server.
export function renderDiffReport(entries) {
  const rows = entries
    .map(
      (e) => `
    <section class="entry">
      <h2>${escapeHtml(e.tourId)} — ${escapeHtml(e.capture)} <span class="viewport">(${escapeHtml(e.viewport)})</span></h2>
      <div class="images">
        <figure><figcaption>Before</figcaption><img src="${escapeHtml(e.beforePath)}" alt="before"></figure>
        <figure><figcaption>After</figcaption><img src="${escapeHtml(e.afterPath)}" alt="after"></figure>
        ${
          e.diffPath
            ? `<figure><figcaption>Diff</figcaption><img src="${escapeHtml(e.diffPath)}" alt="diff"></figure>`
            : `<figure class="no-diff"><figcaption>Diff</figcaption><p>Dimensions changed — no pixel diff available.</p></figure>`
        }
      </div>
    </section>`,
    )
    .join('\n');

  const body =
    entries.length === 0
      ? '<p class="empty">No pending screenshot changes to review.</p>'
      : rows;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DocSolace — screenshot diff review</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-bottom: 0.25rem; }
  .count { color: #555; margin-top: 0; }
  .entry { border-top: 1px solid #ddd; padding: 1.5rem 0; }
  .viewport { font-weight: normal; color: #555; }
  .images { display: flex; gap: 1rem; flex-wrap: wrap; }
  figure { margin: 0; }
  figcaption { font-size: 0.85rem; color: #555; margin-bottom: 0.25rem; }
  img { max-width: 320px; border: 1px solid #ccc; display: block; }
  .empty { color: #555; }
  .no-diff p { max-width: 320px; margin: 0; padding: 0.5rem; border: 1px dashed #ccc; color: #555; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Screenshot diff review</h1>
<p class="count">${entries.length} change${entries.length === 1 ? '' : 's'} pending</p>
${body}
</body>
</html>
`;
}
