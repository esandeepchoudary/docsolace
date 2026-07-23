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
