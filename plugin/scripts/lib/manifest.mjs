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

// stepFailures (optional — capture.mjs's --continue-on-error, see
// runTour) marks the resulting manifest entry `partial: true` and carries
// the failure list along, so generate-docs.mjs can refuse to render a
// tutorial silently missing whatever steps failed instead of treating a
// partial capture the same as a clean one. Omitted (or empty) entirely
// when there were no failures, so every existing 2/3-arg call site's output
// shape is unchanged — no stray `partial`/`stepFailures` keys on a normal,
// fully-successful manifest.
export function buildManifest(tourId, captures, generatedAt = new Date().toISOString(), { stepFailures } = {}) {
  const manifest = { tourId, generatedAt, captures };
  if (stepFailures && stepFailures.length > 0) {
    manifest.partial = true;
    manifest.stepFailures = stepFailures;
  }
  return manifest;
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

// Adding a viewport to docsolace.config.yaml after a tour's last capture
// otherwise means generate-docs.mjs silently renders that tour's docs
// missing the new viewport — no error, no warning, just fewer screenshots
// than configured. Returns the configured viewport names that appear in
// none of this tour's captures, so the caller can warn the user to
// recapture. Empty array when every configured viewport was captured.
export function findMissingViewports(configuredViewportNames, captures) {
  const capturedViewports = new Set(captures.flatMap((c) => Object.keys(c.viewports)));
  return configuredViewportNames.filter((name) => !capturedViewports.has(name));
}
