import { createHash } from 'node:crypto';

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function buildManifest(tourId, captures, generatedAt = new Date().toISOString()) {
  return {
    tourId,
    generatedAt,
    captures,
  };
}

// Flattens a tour manifest's per-capture, per-viewport hashes into one map
// keyed `${captureName}@${viewportName} -> sha256`, for drift comparison.
// Shared by generate-docs.mjs and drift.mjs so they can't drift apart from
// each other on the manifest shape.
export function flattenScreenshotHashes(captures) {
  return Object.fromEntries(
    captures.flatMap((c) =>
      Object.entries(c.viewports).map(([viewportName, v]) => [`${c.name}@${viewportName}`, v.sha256]),
    ),
  );
}
