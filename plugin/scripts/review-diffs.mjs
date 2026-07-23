// Scans .autodocs/artifacts/diffs/ (written by generate-docs.mjs whenever
// the pixel-diff gate decides to update a committed screenshot) and renders
// a single static HTML page for reviewing before/after/diff side by side,
// before pushing a docs change.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { renderDiffReport } from './lib/diff-report.mjs';

function main() {
  const config = loadConfig('autodocs.config.yaml');
  const diffsRoot = path.join(config.outputDir, 'diffs');
  const reportPath = path.join(config.outputDir, 'diff-report.html');

  const entries = [];

  if (fs.existsSync(diffsRoot)) {
    for (const tourId of fs.readdirSync(diffsRoot)) {
      const tourDiffDir = path.join(diffsRoot, tourId);
      if (!fs.statSync(tourDiffDir).isDirectory()) continue;

      for (const file of fs.readdirSync(tourDiffDir)) {
        if (!file.endsWith('.diff.png')) continue;
        const captureAtViewport = file.replace(/\.diff\.png$/, '');
        const [capture, viewport] = captureAtViewport.split('@');

        const diffPath = path.join(tourDiffDir, file);
        const beforePath = path.join(tourDiffDir, `${captureAtViewport}.before.png`);
        const afterPath = path.join('docs', 'images', tourId, `${captureAtViewport}.png`);
        if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) continue;

        entries.push({
          tourId,
          capture,
          viewport,
          beforePath: path.relative(config.outputDir, beforePath),
          afterPath: path.relative(config.outputDir, afterPath),
          diffPath: path.relative(config.outputDir, diffPath),
        });
      }
    }
  }

  fs.writeFileSync(reportPath, renderDiffReport(entries));
  console.log(`${entries.length} pending screenshot change(s). Report: ${reportPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
