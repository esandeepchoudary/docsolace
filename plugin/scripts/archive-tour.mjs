// Archives one tour: flips its status to "archived" and, if it has a
// generated page, moves it (plus its images) under docs/archive/ with a
// banner explaining why. Never deletes tour YAML or doc content — this is
// the action side of orphan detection (see lib/prune.mjs / prune.mjs),
// invoked either by hand or by /document map's autonomous flow once a tour
// is flagged as an orphan candidate.
import fs from 'node:fs';
import path from 'node:path';
import { loadTour } from './lib/tours.mjs';
import { setTourStatus } from './lib/tour-lifecycle.mjs';
import { applyArchiveBanner, archivePaths, buildCategoryJson } from './lib/archive.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
  }
  if (!args.tour) {
    console.error('Usage: archive-tour.mjs --tour <tour-id>');
    process.exit(1);
  }
  return args;
}

function main() {
  const { tour: tourId } = parseArgs(process.argv.slice(2));
  const tour = loadTour('tours', tourId);

  if (tour.status === 'proposed') {
    throw new Error(
      `Tour "${tour.id}" is still "proposed" — it was never confirmed as a real feature, so there's ` +
        `nothing to archive. Delete tours/${tourId}.yaml directly instead if the draft is no longer wanted.`,
    );
  }

  const alreadyArchived = tour.status === 'archived';

  const tourFilePath = path.join('tours', `${tourId}.yaml`);
  const rawYaml = fs.readFileSync(tourFilePath, 'utf8');
  const updatedYaml = setTourStatus(rawYaml, 'archived');
  if (updatedYaml !== rawYaml) {
    writeFileAtomic(tourFilePath, updatedYaml);
  }

  const { docFrom, docTo, imagesFrom, imagesTo, archiveDir } = archivePaths(tourId);
  let movedDoc = false;
  let movedImages = false;

  if (fs.existsSync(docFrom)) {
    const content = fs.readFileSync(docFrom, 'utf8');
    writeFileAtomic(docTo, applyArchiveBanner(content));
    fs.rmSync(docFrom);
    movedDoc = true;
  }

  if (fs.existsSync(imagesFrom)) {
    fs.mkdirSync(path.dirname(imagesTo), { recursive: true });
    fs.renameSync(imagesFrom, imagesTo);
    movedImages = true;
  }

  // Written once, idempotently — never overwritten if a human has already
  // customized the category label/position for their docs site.
  const categoryPath = path.join(archiveDir, '_category_.json');
  let wroteCategory = false;
  if ((movedDoc || fs.existsSync(archiveDir)) && !fs.existsSync(categoryPath)) {
    writeFileAtomic(categoryPath, buildCategoryJson());
    wroteCategory = true;
  }

  console.log(`Archived "${tour.id}":`);
  console.log(alreadyArchived ? '  - status was already "archived"' : '  - status: archived (tours/*.yaml updated)');
  console.log(movedDoc ? `  - ${docFrom} -> ${docTo} (banner added)` : `  - no generated page at ${docFrom} to move`);
  if (fs.existsSync(imagesTo)) {
    console.log(movedImages ? `  - ${imagesFrom} -> ${imagesTo}` : `  - images already at ${imagesTo}`);
  }
  console.log(wroteCategory ? `  - ${categoryPath} (new "Archive" sidebar section)` : `  - ${categoryPath} already existed, left untouched`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
