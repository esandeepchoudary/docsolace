import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFile, writeFileAtomic } from '../fs-atomic.mjs';

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
