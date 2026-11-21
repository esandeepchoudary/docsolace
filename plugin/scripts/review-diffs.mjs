// Scans .docsolace/artifacts/diffs/ (written by generate-docs.mjs whenever
// the pixel-diff gate decides to update a committed screenshot) and renders
// a single static HTML page for reviewing before/after/diff side by side,
// before pushing a docs change.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { collectDiffEntries, renderDiffMarkdown, renderDiffReport } from './lib/diff-report.mjs';
import { pixelDiffRatio } from './lib/pixel-diff.mjs';

function main() {
  const config = loadConfig('docsolace.config.yaml');
  const diffsRoot = path.join(config.outputDir, 'diffs');
  const reportPath = path.join(config.outputDir, 'diff-report.html');

  const entries = collectDiffEntries({ diffsRoot, outputDir: config.outputDir });

  fs.writeFileSync(reportPath, renderDiffReport(entries));
  console.log(`${entries.length} pending screenshot change(s). Report: ${reportPath}`);
  // --markdown: also print a PR-body-ready table (see renderDiffMarkdown).
  if (process.argv.includes('--markdown')) {
    console.log('');
    console.log(
      renderDiffMarkdown(entries, {
        ratioFor: (e) => pixelDiffRatio(path.join(config.outputDir, e.beforePath), path.join(config.outputDir, e.afterPath)),
      }),
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
