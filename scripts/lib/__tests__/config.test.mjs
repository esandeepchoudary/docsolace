import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.mjs';

const tmpFiles = [];

function writeTmpYaml(contents) {
  const filePath = path.join(os.tmpdir(), `autodocs-config-test-${Date.now()}-${Math.random()}.yaml`);
  fs.writeFileSync(filePath, contents);
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  while (tmpFiles.length) fs.rmSync(tmpFiles.pop(), { force: true });
});

describe('loadConfig', () => {
  it('loads a valid config', () => {
    const filePath = writeTmpYaml('baseUrl: http://localhost:5173\noutputDir: .autodocs/artifacts\n');
    expect(loadConfig(filePath)).toEqual({
      baseUrl: 'http://localhost:5173',
      outputDir: '.autodocs/artifacts',
    });
  });

  it('throws when baseUrl is missing', () => {
    const filePath = writeTmpYaml('outputDir: .autodocs/artifacts\n');
    expect(() => loadConfig(filePath)).toThrow(/baseUrl/);
  });

  it('throws when outputDir is missing', () => {
    const filePath = writeTmpYaml('baseUrl: http://localhost:5173\n');
    expect(() => loadConfig(filePath)).toThrow(/outputDir/);
  });
});
