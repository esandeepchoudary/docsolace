// Reports which confirmed/stable tours look orphaned — their feature may
// have been removed from the app — without mutating anything. Mirrors
// drift.mjs's shape (a read-only report, non-zero exit when it finds
// something) but checks the opposite direction: not "did this tour's content
// change" but "does this tour's feature still exist at all". See
// lib/prune.mjs for the two detection signals and archive-tour.mjs for the
// action that actually archives a flagged tour.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { findOrphanTours, isStrongOrphanSignal } from './lib/prune.mjs';
import { loadState } from './lib/state.mjs';
import { readJsonFile } from './lib/fs-atomic.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--site-map') args.siteMap = argv[i + 1];
    if (argv[i] === '--routes-file') args.routesFile = argv[i + 1];
  }
  return args;
}

function main() {
  const { siteMap: siteMapPath, routesFile } = parseArgs(process.argv.slice(2));
  const config = loadConfig('autodocs.config.yaml');
  const statePath = path.join(config.outputDir, 'state.json');
  const state = loadState(statePath);

  if (!fs.existsSync('tours')) {
    console.log('No tours/ directory yet — run /autodocs:document once to bootstrap this project.');
    return;
  }

  const tourIds = fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));
  const tours = tourIds.map((id) => loadTour('tours', id));

  // --site-map/--routes-file are explicit overrides; without them, fall back
  // to the conventional paths /document map's own crawl/code-review steps
  // write to, if they happen to already exist from a previous map run — a
  // stronger check when available, but never required (the code_paths-only
  // signal still works standalone, no crawl needed).
  const resolvedSiteMapPath = siteMapPath ?? path.join(config.outputDir, 'site-map.json');
  const resolvedRoutesFilePath = routesFile ?? path.join(config.outputDir, 'source-routes.json');
  const siteMapData = fs.existsSync(resolvedSiteMapPath) ? readJsonFile(resolvedSiteMapPath, undefined) : undefined;
  const siteMap = siteMapData?.pages;
  const sourceRoutes = fs.existsSync(resolvedRoutesFilePath) ? readJsonFile(resolvedRoutesFilePath, undefined) : undefined;

  if (siteMap || sourceRoutes) {
    console.log(
      `Reconciling against ${siteMap ? resolvedSiteMapPath : ''}${siteMap && sourceRoutes ? ' and ' : ''}` +
        `${sourceRoutes ? resolvedRoutesFilePath : ''} (route-unreachable check enabled).`,
    );
  } else {
    console.log('No site-map.json/source-routes.json found — checking code_paths only (run `/document map` first for a fuller check).');
  }

  const orphans = findOrphanTours({ tours, state, siteMap, sourceRoutes });
  const strong = orphans.filter((o) => isStrongOrphanSignal(o.reasons));
  const weak = orphans.filter((o) => !isStrongOrphanSignal(o.reasons));

  for (const tour of tours) {
    const orphan = orphans.find((o) => o.tourId === tour.id);
    if (!orphan) {
      console.log(`  ok      ${tour.id}`);
    } else if (isStrongOrphanSignal(orphan.reasons)) {
      console.log(`  orphan  ${tour.id} (${orphan.reasons.join(', ')}) — safe to auto-archive`);
    } else {
      console.log(`  orphan  ${tour.id} (${orphan.reasons.join(', ')}) — needs human review, not auto-archived (crawl coverage is best-effort, not proof)`);
    }
  }

  if (strong.length > 0) {
    console.log(
      `\n${strong.length} orphan(s) with strong evidence (code_paths no longer resolves to anything — the ` +
        `committed source is actually gone). Run "node archive-tour.mjs --tour <id>" for each, or let an ` +
        `autonomous /document map|prune run do it.`,
    );
  }
  if (weak.length > 0) {
    console.log(
      `\n${weak.length} orphan candidate(s) with weak evidence only (route not seen in the last crawl/code ` +
        `review — that pass may simply have missed it). Review by hand before archiving; not auto-archived ` +
        `even in autonomous mode.`,
    );
  }

  process.exit(orphans.length > 0 ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
