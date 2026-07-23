import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { computeCodePathsHash, isTourDirty, resolveCodePathFiles } from '../drift.mjs';

const tmpDirs = [];

function mkTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-drift-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('resolveCodePathFiles', () => {
  it('resolves glob patterns to a sorted, deduped list of files', () => {
    const dir = mkTmpDir();
    fs.mkdirSync(path.join(dir, 'src/pages/Dashboard'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/pages/Dashboard/Dashboard.jsx'), 'a');
    fs.writeFileSync(path.join(dir, 'src/pages/Dashboard/Dashboard.css'), 'b');
    fs.writeFileSync(path.join(dir, 'src/pages/Login.jsx'), 'c');

    const files = resolveCodePathFiles(['src/pages/Dashboard/**', 'src/pages/Dashboard/**'], dir);
    expect(files).toEqual(['src/pages/Dashboard/Dashboard.css', 'src/pages/Dashboard/Dashboard.jsx']);
  });

  it('returns an empty array for no patterns', () => {
    expect(resolveCodePathFiles(undefined, mkTmpDir())).toEqual([]);
  });
});

function initGitRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

function commitAll(dir, message) {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir });
}

describe('computeCodePathsHash', () => {
  it('is stable when the committed files do not change', () => {
    const dir = mkTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'v1');
    commitAll(dir, 'initial');

    const first = computeCodePathsHash(['Dashboard.jsx'], dir);
    const second = computeCodePathsHash(['Dashboard.jsx'], dir);
    expect(first).toBe(second);
  });

  it('changes when a committed file under code_paths changes', () => {
    const dir = mkTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'v1');
    commitAll(dir, 'initial');
    const before = computeCodePathsHash(['Dashboard.jsx'], dir);

    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'v2');
    commitAll(dir, 'update');
    const after = computeCodePathsHash(['Dashboard.jsx'], dir);

    expect(after).not.toBe(before);
  });

  it('is unaffected by changes to files outside code_paths', () => {
    const dir = mkTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'v1');
    fs.writeFileSync(path.join(dir, 'Login.jsx'), 'v1');
    commitAll(dir, 'initial');
    const before = computeCodePathsHash(['Dashboard.jsx'], dir);

    fs.writeFileSync(path.join(dir, 'Login.jsx'), 'v2');
    commitAll(dir, 'unrelated update');
    const after = computeCodePathsHash(['Dashboard.jsx'], dir);

    expect(after).toBe(before);
  });
});

describe('isTourDirty', () => {
  const baseTour = { maturity: 'stable' };

  it('is always false for draft tours', () => {
    expect(
      isTourDirty({
        tour: { maturity: 'draft' },
        previousEntry: undefined,
        currentScreenshotHashes: {},
        currentCodePathsHash: 'x',
      }),
    ).toBe(false);
  });

  it('is dirty when there is no previous entry (never generated)', () => {
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry: undefined,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
      }),
    ).toBe(true);
  });

  it('is not dirty when nothing changed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
      }),
    ).toBe(false);
  });

  it('is dirty when a screenshot hash changed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry,
        currentScreenshotHashes: { a: '2' },
        currentCodePathsHash: 'x',
      }),
    ).toBe(true);
  });

  it('is dirty when the code_paths hash changed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'y',
      }),
    ).toBe(true);
  });
});
