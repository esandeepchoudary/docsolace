import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.mjs';

const tmpFiles = [];
const VALID_BASE = 'baseUrl: http://localhost:5173\noutputDir: .autodocs/artifacts\n';
const VALID_VIEWPORTS = 'viewports:\n  desktop:\n    width: 1280\n    height: 800\n';

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
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS);
    expect(loadConfig(filePath)).toEqual({
      baseUrl: 'http://localhost:5173',
      outputDir: '.autodocs/artifacts',
      viewports: { desktop: { width: 1280, height: 800 } },
    });
  });

  it('throws when baseUrl is missing', () => {
    const filePath = writeTmpYaml('outputDir: .autodocs/artifacts\n' + VALID_VIEWPORTS);
    expect(() => loadConfig(filePath)).toThrow(/baseUrl/);
  });

  it('throws when outputDir is missing', () => {
    const filePath = writeTmpYaml('baseUrl: http://localhost:5173\n' + VALID_VIEWPORTS);
    expect(() => loadConfig(filePath)).toThrow(/outputDir/);
  });

  it('throws when viewports is missing', () => {
    const filePath = writeTmpYaml(VALID_BASE);
    expect(() => loadConfig(filePath)).toThrow(/viewports/);
  });

  it('throws when viewports is an empty object', () => {
    const filePath = writeTmpYaml(VALID_BASE + 'viewports: {}\n');
    expect(() => loadConfig(filePath)).toThrow(/viewports/);
  });
});
