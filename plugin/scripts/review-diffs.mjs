// Scans .autodocs/artifacts/diffs/ (written by generate-docs.mjs whenever
// the pixel-diff gate decides to update a committed screenshot) and renders
// a single static HTML page for reviewing before/after/diff side by side,
// before pushing a docs change.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { collectDiffEntries, renderDiffReport } from './lib/diff-report.mjs';

function main() {
  const config = loadConfig('autodocs.config.yaml');
  const diffsRoot = path.join(config.outputDir, 'diffs');
  const reportPath = path.join(config.outputDir, 'diff-report.html');

  const entries = collectDiffEntries({ diffsRoot, outputDir: config.outputDir });

  fs.writeFileSync(reportPath, renderDiffReport(entries));
  console.log(`${entries.length} pending screenshot change(s). Report: ${reportPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
