function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
        <figure><figcaption>Diff</figcaption><img src="${escapeHtml(e.diffPath)}" alt="diff"></figure>
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
<title>AutoDocs — screenshot diff review</title>
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
