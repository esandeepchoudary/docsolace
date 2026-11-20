// Read-only triage for a bare `/document` run. Prints JSON the skill reads to
// decide what to do without asking the user to pick a mode or a slug:
//   { changedFiles, resync: [{tourId, files}], uncovered: [files], suggestedSlug? }
//
//   node triage.mjs [--description "free text"] [--args "raw argument string"]
//
// --description derives a safe, de-duplicated slug from free text.
// --args routes a raw argument string (mode / existing tour / description).
import fs from 'node:fs';
import { loadTour } from './lib/tours.mjs';
import {
  classifyChangedFiles,
  listChangedFiles,
  routeArguments,
  slugifyDescription,
} from './lib/triage.mjs';

const KNOWN_MODES = ['propose', 'map', 'prune', 'product', 'validate', 'status', 'init-site'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--description') args.description = argv[++i];
    if (argv[i] === '--args') args.args = argv[++i];
  }
  return args;
}

function main() {
  const { description, args: rawArgs } = parseArgs(process.argv.slice(2));

  const tourIds = fs.existsSync('tours')
    ? fs.readdirSync('tours').filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''))
    : [];

  const out = {};
  if (rawArgs !== undefined) out.route = routeArguments(rawArgs, { knownModes: KNOWN_MODES, tourIds });
  if (description !== undefined) out.suggestedSlug = slugifyDescription(description, tourIds);

  if (rawArgs === undefined || out.route.kind === 'pipeline') {
    const tours = tourIds.map((id) => loadTour('tours', id));
    const changedFiles = listChangedFiles();
    out.changedFiles = changedFiles;
    Object.assign(out, classifyChangedFiles({ changedFiles, tours }));
  }

  console.log(JSON.stringify(out, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
