// Preflight check, run before capture/drift/generate: catches an undefined
// preconditions.auth profile, a code_paths glob matching nothing, a
// CSS-only interactive selector, or an unrecorded storageStatePath session,
// without launching a browser. See lib/validate.mjs for what each check
// means and why.
import fs from 'node:fs';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { validateTour } from './lib/validate.mjs';

function main() {
  const config = loadConfig('autodocs.config.yaml');

  if (!fs.existsSync('tours')) {
    console.log('No tours/ directory yet — run /autodocs:document once to bootstrap this project.');
    return;
  }

  const tourIds = fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));

  if (tourIds.length === 0) {
    console.log('No tours yet under tours/ — nothing to validate.');
    return;
  }

  let hasError = false;

  for (const fileId of tourIds) {
    // Isolated per tour: a single malformed tour file (bad slug, invalid
    // YAML, missing required field) shouldn't abort the whole report and
    // leave every other tour unvalidated — report it as one finding and
    // keep going, same as any other error this loop already reports.
    let tour;
    try {
      tour = loadTour('tours', fileId);
    } catch (err) {
      hasError = true;
      console.log(`  error   ${fileId}: ${err.message}`);
      continue;
    }

    const findings = validateTour(config, tour);

    if (findings.length === 0) {
      console.log(`  ok      ${tour.id}`);
      continue;
    }
    for (const finding of findings) {
      if (finding.level === 'error') hasError = true;
      console.log(`  ${finding.level === 'error' ? 'error  ' : 'warn   '} ${tour.id}: ${finding.message}`);
    }
  }

  if (hasError) {
    console.error('\nFound at least one error — fix it before running /autodocs:document.');
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
