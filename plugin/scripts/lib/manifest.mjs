import { createHash } from 'node:crypto';
import { readJsonFile, withFileLock, writeFileAtomic } from './fs-atomic.mjs';

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// Shared by capture.mjs (write) and generate-docs.mjs/drift.mjs (read) so
// none of the three can drift on how manifest.json is read, missing-file
// handling, or corrupt-JSON error messages.
export function loadManifest(manifestPath) {
  return readJsonFile(manifestPath, {});
}

export function saveManifestEntry(manifestPath, manifest) {
  return withFileLock(manifestPath, () => {
    const existing = loadManifest(manifestPath);
    existing[manifest.tourId] = manifest;
    writeFileAtomic(manifestPath, JSON.stringify(existing, null, 2));
    return existing;
  });
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
