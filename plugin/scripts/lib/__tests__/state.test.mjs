import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadState, recordCaptureResult, saveTourState } from '../state.mjs';

const tmpDirs = [];

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-state-test-'));
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

describe('recordCaptureResult', () => {
  it('creates a fresh entry with lastCaptureError null and consecutiveFailures 0 on success', () => {
    const statePath = tmpStatePath();
    recordCaptureResult(statePath, 'login', { error: null });
    expect(loadState(statePath).login).toEqual({ lastCaptureError: null, consecutiveFailures: 0 });
  });

  it('records an error and starts a failure streak at 1', () => {
    const statePath = tmpStatePath();
    recordCaptureResult(statePath, 'login', { error: 'selector not found' });
    expect(loadState(statePath).login).toEqual({ lastCaptureError: 'selector not found', consecutiveFailures: 1 });
  });

  it('increments consecutiveFailures across repeated failures', () => {
    const statePath = tmpStatePath();
    recordCaptureResult(statePath, 'login', { error: 'first failure' });
    recordCaptureResult(statePath, 'login', { error: 'second failure' });
    recordCaptureResult(statePath, 'login', { error: 'third failure' });
    expect(loadState(statePath).login).toEqual({ lastCaptureError: 'third failure', consecutiveFailures: 3 });
  });

  it('clears the streak back to 0 on the next success', () => {
    const statePath = tmpStatePath();
    recordCaptureResult(statePath, 'login', { error: 'first failure' });
    recordCaptureResult(statePath, 'login', { error: 'second failure' });
    recordCaptureResult(statePath, 'login', { error: null });
    expect(loadState(statePath).login).toEqual({ lastCaptureError: null, consecutiveFailures: 0 });
  });

  it('merges into an existing entry instead of replacing it (unlike saveTourState)', () => {
    const statePath = tmpStatePath();
    saveTourState(statePath, 'login', { screenshotHashes: { a: '1' }, codePathsHash: 'x', renderHash: 'r1' });
    recordCaptureResult(statePath, 'login', { error: 'selector not found' });
    expect(loadState(statePath).login).toEqual({
      screenshotHashes: { a: '1' },
      codePathsHash: 'x',
      renderHash: 'r1',
      lastCaptureError: 'selector not found',
      consecutiveFailures: 1,
    });
  });

  it('does not affect other tours’ entries', () => {
    const statePath = tmpStatePath();
    saveTourState(statePath, 'dashboard-overview', { screenshotHashes: {}, codePathsHash: 'b' });
    recordCaptureResult(statePath, 'login', { error: 'x' });
    expect(loadState(statePath)['dashboard-overview']).toEqual({ screenshotHashes: {}, codePathsHash: 'b' });
  });
});
