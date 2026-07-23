import fs from 'node:fs';
import path from 'node:path';

export function loadState(statePath) {
  if (!fs.existsSync(statePath)) return {};
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

export function saveTourState(statePath, tourId, entry) {
  const state = loadState(statePath);
  state[tourId] = entry;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return state;
}
