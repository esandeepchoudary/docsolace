import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadState, saveTourState } from '../state.mjs';

const tmpDirs = [];

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-state-test-'));
  tmpDirs.push(dir);
  return path.join(dir, 'nested', 'state.json');
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('loadState', () => {
  it('returns an empty object when the state file does not exist', () => {
    expect(loadState(tmpStatePath())).toEqual({});
  });
});

describe('saveTourState', () => {
  it('creates the state file (and parent dirs) with a single tour entry', () => {
    const statePath = tmpStatePath();
    const entry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    saveTourState(statePath, 'login', entry);
    expect(loadState(statePath)).toEqual({ login: entry });
  });

  it('merges with existing entries for other tours', () => {
    const statePath = tmpStatePath();
    saveTourState(statePath, 'login', { screenshotHashes: {}, codePathsHash: 'a' });
    saveTourState(statePath, 'dashboard-overview', { screenshotHashes: {}, codePathsHash: 'b' });
    const state = loadState(statePath);
    expect(Object.keys(state).sort()).toEqual(['dashboard-overview', 'login']);
  });

  it('overwrites a tour entry when saved again', () => {
    const statePath = tmpStatePath();
    saveTourState(statePath, 'login', { screenshotHashes: {}, codePathsHash: 'a' });
    saveTourState(statePath, 'login', { screenshotHashes: {}, codePathsHash: 'b' });
    expect(loadState(statePath).login.codePathsHash).toBe('b');
  });
});
