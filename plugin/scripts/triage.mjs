// Read-only triage for a bare `/document` run. Prints JSON the skill reads to
// decide what to do without asking the user to pick a mode or a slug:
//   { changedFiles, resync: [{tourId, files}], uncovered: [files], suggestedSlug?, skippedTours? }
//
//   node triage.mjs [--description "free text"] [--args "raw argument string"]
//
// --description derives a safe, de-duplicated slug from free text.
// --args routes a raw argument string (mode / existing tour / description).
// Logic lives in lib/triage.mjs (buildTriageReport) so it's unit-tested.
import { buildTriageReport, parseTriageArgs } from './lib/triage.mjs';

try {
  const { description, args: rawArgs } = parseTriageArgs(process.argv.slice(2));
  console.log(JSON.stringify(buildTriageReport({ rawArgs, description }), null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
