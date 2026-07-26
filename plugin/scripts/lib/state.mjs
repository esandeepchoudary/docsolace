import { readJsonFile, withFileLock, writeFileAtomic } from './fs-atomic.mjs';

export function loadState(statePath) {
  return readJsonFile(statePath, {});
}

export function saveTourState(statePath, tourId, entry) {
  return withFileLock(statePath, () => {
    const state = loadState(statePath);
    state[tourId] = entry;
    writeFileAtomic(statePath, JSON.stringify(state, null, 2));
    return state;
  });
}

// Records the outcome of capture.mjs's most recent attempt for one tour —
// `error: null` clears any prior failure streak, a non-null message extends
// it. Unlike saveTourState (a full replace — generate-docs.mjs/
// generate-product-docs.mjs already own every field of the entries they
// write and always set them all), this only ever merges these two specific
// keys into whatever entry already exists, so it can never clobber a
// tour's screenshotHashes/codePathsHash/etc. written by a previous
// generate-docs.mjs run — capture.mjs and generate-docs.mjs update
// different, non-overlapping parts of the same entry over its lifetime.
export function recordCaptureResult(statePath, tourId, { error }) {
  return withFileLock(statePath, () => {
    const state = loadState(statePath);
    const previous = state[tourId] ?? {};
    state[tourId] = {
      ...previous,
      lastCaptureError: error ?? null,
      consecutiveFailures: error ? (previous.consecutiveFailures ?? 0) + 1 : 0,
    };
    writeFileAtomic(statePath, JSON.stringify(state, null, 2));
    return state;
  });
}
