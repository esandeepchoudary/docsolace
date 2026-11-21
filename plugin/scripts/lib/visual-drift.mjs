// What counts as a *real* change to a tour's captures, shared by drift.mjs,
// generate-docs.mjs and status.mjs so they can never disagree.
//
// Two signals, kept separate:
//  - visual: a screenshot whose pixels differ from the published image by at
//    least `pixelDiffThreshold`. Anything below it is rendering noise
//    (antialiasing, subpixel shifts); it keeps its previous hash so the tour
//    isn't marked dirty and doc-scribe isn't called for nothing.
//  - semantic: the accessibility snapshots (and the step description stored
//    beside each). A label change can have zero pixel impact but still make
//    the prose wrong, so it is a reason of its own ('semantics').
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { flattenScreenshotHashes } from './manifest.mjs';
import { pixelDiffRatio } from './pixel-diff.mjs';

export const DEFAULT_PIXEL_DIFF_THRESHOLD = 0.005;

export function resolveEffectiveScreenshotHashes({
  tourId,
  captures,
  previousEntry,
  outputDir,
  docsDir = 'docs',
  threshold = DEFAULT_PIXEL_DIFF_THRESHOLD,
}) {
  const current = flattenScreenshotHashes(captures);
  const previous = previousEntry?.screenshotHashes;
  if (!previous) return current;
  const effective = { ...current };
  for (const capture of captures) {
    for (const [viewportName, shot] of Object.entries(capture.viewports)) {
      const key = `${capture.name}@${viewportName}`;
      if (previous[key] === undefined || previous[key] === current[key]) continue;
      const published = path.join(docsDir, 'images', tourId, `${key}.png`);
      const candidate = path.join(outputDir, shot.png);
      // pixelDiffRatio is 1 when either file is missing, so an absent
      // published image always counts as a real change.
      // An unreadable/corrupt PNG is a real change to look at, not a crash
      // that takes the whole drift/status report down.
      let ratio = 1;
      try {
        ratio = pixelDiffRatio(published, candidate);
      } catch {
        // keep ratio = 1
      }
      if (ratio < threshold) effective[key] = previous[key];
    }
  }
  return effective;
}

// One hash over every capture's snapshot file. undefined when there are no
// readable snapshots (older manifests), which disables the semantic signal.
export function computeA11yHash(captures, outputDir) {
  const hash = createHash('sha256');
  let any = false;
  const keys = [];
  for (const capture of captures) {
    for (const [viewportName, shot] of Object.entries(capture.viewports)) {
      if (shot.a11y) keys.push([`${capture.name}@${viewportName}`, shot.a11y]);
    }
  }
  for (const [key, rel] of keys.sort(([a], [b]) => a.localeCompare(b))) {
    try {
      hash.update(`${key}:${createHash('sha256').update(fs.readFileSync(path.join(outputDir, rel))).digest('hex')}\n`);
      any = true;
    } catch {
      // unreadable snapshot: contributes nothing
    }
  }
  return any ? hash.digest('hex') : undefined;
}

export function computeCaptureInputs({ tour, tourManifest, previousEntry, config, docsDir = 'docs' }) {
  return {
    currentScreenshotHashes: resolveEffectiveScreenshotHashes({
      tourId: tour.id,
      captures: tourManifest.captures,
      previousEntry,
      outputDir: config.outputDir,
      docsDir,
      threshold: config.pixelDiffThreshold ?? DEFAULT_PIXEL_DIFF_THRESHOLD,
    }),
    currentA11yHash: computeA11yHash(tourManifest.captures, config.outputDir),
  };
}
