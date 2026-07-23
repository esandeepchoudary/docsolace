import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFile, withFileLock, writeFileAtomic } from '../fs-atomic.mjs';

const tmpDirs = [];

function tmpPath(fileName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-fs-atomic-test-'));
  tmpDirs.push(dir);
  return path.join(dir, fileName);
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('creates the file (and parent dirs) with the given content', () => {
    const filePath = tmpPath('nested/file.json');
    writeFileAtomic(filePath, '{"a":1}');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('{"a":1}');
  });

  it('overwrites an existing file rather than appending', () => {
    const filePath = tmpPath('file.json');
    writeFileAtomic(filePath, 'first');
    writeFileAtomic(filePath, 'second');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('second');
  });

  it('leaves no stray temp files behind in the target directory', () => {
    const filePath = tmpPath('file.json');
    writeFileAtomic(filePath, 'content');
    const dir = path.dirname(filePath);
    expect(fs.readdirSync(dir)).toEqual(['file.json']);
  });
});

describe('readJsonFile', () => {
  it('returns the fallback when the file does not exist', () => {
    expect(readJsonFile(tmpPath('missing.json'), { default: true })).toEqual({ default: true });
  });

  it('parses valid JSON', () => {
    const filePath = tmpPath('file.json');
    fs.writeFileSync(filePath, '{"a":1}');
    expect(readJsonFile(filePath, {})).toEqual({ a: 1 });
  });

  it('throws a clear, path-including error on corrupt JSON instead of a bare SyntaxError', () => {
    const filePath = tmpPath('file.json');
    fs.writeFileSync(filePath, '{not valid json');
    expect(() => readJsonFile(filePath, {})).toThrow(filePath);
    expect(() => readJsonFile(filePath, {})).toThrow(/corrupted/);
  });
});

describe('withFileLock', () => {
  it("returns fn's return value", () => {
    const filePath = tmpPath('data.json');
    expect(withFileLock(filePath, () => 42)).toBe(42);
  });

  it('removes the lock file after fn completes, on success or failure', () => {
    const filePath = tmpPath('data.json');
    const dir = path.dirname(filePath);
    const hasLockFile = () => fs.readdirSync(dir).some((f) => f.endsWith('.lock'));

    withFileLock(filePath, () => {});
    expect(hasLockFile()).toBe(false);

    expect(() =>
      withFileLock(filePath, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(hasLockFile()).toBe(false);
  });

  it('serializes concurrent load-mutate-write updates across processes so no update is lost', async () => {
    const filePath = tmpPath('shared.json');
    fs.writeFileSync(filePath, '{}');
    const fsAtomicPath = fileURLToPath(new URL('../fs-atomic.mjs', import.meta.url));
    const scriptPath = tmpPath('writer.mjs');
    // Widens the race window (via a busy-wait while the lock is held) so
    // that if withFileLock didn't actually serialize the two processes,
    // this test would flake into losing one of the two keys almost every run.
    fs.writeFileSync(
      scriptPath,
      `
import { withFileLock, readJsonFile, writeFileAtomic } from ${JSON.stringify(fsAtomicPath)};
const [, , targetPath, key] = process.argv;
withFileLock(targetPath, () => {
  const data = readJsonFile(targetPath, {});
  const start = Date.now();
  while (Date.now() - start < 50) {}
  data[key] = true;
  writeFileAtomic(targetPath, JSON.stringify(data));
});
`,
    );

    const run = (key) =>
      new Promise((resolve, reject) => {
        execFile('node', [scriptPath, filePath, key], (err) => (err ? reject(err) : resolve()));
      });

    await Promise.all([run('a'), run('b')]);

    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({ a: true, b: true });
  });
});
