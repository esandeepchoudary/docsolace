import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeCodePathsHash,
  getDirtyReasons,
  isRenderOnlyDirty,
  isTourDirty,
  resolveCodePathFiles,
} from '../drift.mjs';

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

  it('is always false for proposed tours, even if stable and never generated', () => {
    expect(
      isTourDirty({
        tour: { maturity: 'stable', status: 'proposed' },
        previousEntry: undefined,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
      }),
    ).toBe(false);
  });

  it('is always false for archived tours, even with a changed screenshot/code hash', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    expect(
      isTourDirty({
        tour: { maturity: 'stable', status: 'archived' },
        previousEntry,
        currentScreenshotHashes: { a: '2' },
        currentCodePathsHash: 'y',
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

  it('is not dirty when currentRenderHash matches the previous renderHash and nothing else changed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x', renderHash: 'r1' };
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
        currentRenderHash: 'r1',
      }),
    ).toBe(false);
  });

  it('is dirty when the render hash changed (e.g. a template/style change) even if nothing else did', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x', renderHash: 'r1' };
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
        currentRenderHash: 'r2',
      }),
    ).toBe(true);
  });

  it('is dirty when the previous entry has no renderHash at all (predates the render-hash feature)', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    expect(
      isTourDirty({
        tour: baseTour,
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
        currentRenderHash: 'r1',
      }),
    ).toBe(true);
  });

  it('ignores render hash entirely when currentRenderHash is not passed (back-compat callers)', () => {
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

  it('draft/proposed still wins over a changed render hash', () => {
    const previousEntry = { screenshotHashes: {}, codePathsHash: 'x', renderHash: 'r1' };
    expect(
      isTourDirty({
        tour: { maturity: 'draft' },
        previousEntry,
        currentScreenshotHashes: {},
        currentCodePathsHash: 'x',
        currentRenderHash: 'r2',
      }),
    ).toBe(false);
    expect(
      isTourDirty({
        tour: { maturity: 'stable', status: 'proposed' },
        previousEntry,
        currentScreenshotHashes: {},
        currentCodePathsHash: 'x',
        currentRenderHash: 'r2',
      }),
    ).toBe(false);
  });
});

describe('getDirtyReasons', () => {
  it('returns ["never-generated"] when there is no previous entry', () => {
    expect(
      getDirtyReasons({
        previousEntry: undefined,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
        currentRenderHash: 'r1',
      }),
    ).toEqual(['never-generated']);
  });

  it('returns [] when nothing changed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x', renderHash: 'r1' };
    expect(
      getDirtyReasons({
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
        currentRenderHash: 'r1',
      }),
    ).toEqual([]);
  });

  it('reports "render" alone when only the render hash changed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x', renderHash: 'r1' };
    expect(
      getDirtyReasons({
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
        currentRenderHash: 'r2',
      }),
    ).toEqual(['render']);
  });

  it('reports every changed dimension together', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x', renderHash: 'r1' };
    expect(
      getDirtyReasons({
        previousEntry,
        currentScreenshotHashes: { a: '2' },
        currentCodePathsHash: 'y',
        currentRenderHash: 'r2',
      }),
    ).toEqual(['screenshots', 'code', 'render']);
  });

  it('ignores render entirely when currentRenderHash is not passed', () => {
    const previousEntry = { screenshotHashes: { a: '1' }, codePathsHash: 'x' };
    expect(
      getDirtyReasons({
        previousEntry,
        currentScreenshotHashes: { a: '1' },
        currentCodePathsHash: 'x',
      }),
    ).toEqual([]);
  });
});

describe('isRenderOnlyDirty', () => {
  it('is true when the only reason is "render"', () => {
    expect(isRenderOnlyDirty(['render'])).toBe(true);
  });

  it('is false when render is mixed with a content reason', () => {
    expect(isRenderOnlyDirty(['render', 'screenshots'])).toBe(false);
  });

  it('is false for content-only reasons', () => {
    expect(isRenderOnlyDirty(['screenshots'])).toBe(false);
  });

  it('is false for an empty (clean) reasons list', () => {
    expect(isRenderOnlyDirty([])).toBe(false);
  });

  it('is false for never-generated (there is no prose to reuse yet)', () => {
    expect(isRenderOnlyDirty(['never-generated'])).toBe(false);
  });
});
