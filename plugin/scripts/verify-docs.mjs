// Preflight check run after generation, before a docs PR opens: do the
// image references and internal links generate-docs.mjs (and
// archive-tour.mjs) just wrote actually resolve, and — with --build — does
// the scaffolded site still build. See lib/verify.mjs for what each check
// means and why; this CLI just reports findings the same way validate.mjs
// does and exits non-zero on an "error" finding.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { verifyDocs } from './lib/verify.mjs';

function parseArgs(argv) {
  return { build: argv.includes('--build') };
}

function runSiteBuild() {
  // Opt-in and skipped entirely when there's no scaffolded site — a project
  // may publish elsewhere, and the build itself is slow enough that it
  // shouldn't be forced on every run just to check the fast, structural
  // checks above.
  if (!fs.existsSync('site')) {
    console.log('  (no site/ directory — skipping --build)');
    return true;
  }
  console.log('  building site/ ...');
  const result = spawnSync('npm', ['run', 'build'], { cwd: 'site', stdio: 'inherit' });
  if (result.error) {
    console.error(`  site build failed to start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`  site build exited with status ${result.status}`);
    return false;
  }
  return true;
}

function main() {
  const { build } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync('docs')) {
    console.log('No docs/ directory yet — nothing to verify.');
    return;
  }

  const findings = verifyDocs('docs');
  let hasError = false;

  if (findings.length === 0) {
    console.log('  ok      no broken image references, broken links, or orphan images found');
  } else {
    for (const finding of findings) {
      if (finding.level === 'error') hasError = true;
      console.log(`  ${finding.level === 'error' ? 'error  ' : 'warn   '} ${finding.tour}: ${finding.message}`);
    }
  }

  if (build && !runSiteBuild()) {
    hasError = true;
  }

  if (hasError) {
    console.error('\nFound at least one error — fix it before opening a docs PR.');
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
