import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildManifest, flattenScreenshotHashes, loadManifest, saveManifestEntry, sha256Buffer } from '../manifest.mjs';

describe('sha256Buffer', () => {
  it('hashes an empty buffer to the well-known empty-string SHA-256', () => {
    expect(sha256Buffer(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "hello" to its well-known SHA-256', () => {
    expect(sha256Buffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('produces different hashes for different content', () => {
    expect(sha256Buffer(Buffer.from('a'))).not.toBe(sha256Buffer(Buffer.from('b')));
  });
});

describe('buildManifest', () => {
  it('builds a manifest with tourId, captures, and a generatedAt timestamp', () => {
    const captures = [{ name: 'shot-1', sha256: 'abc' }];
    const manifest = buildManifest('login', captures, '2026-01-01T00:00:00.000Z');
    expect(manifest).toEqual({
      tourId: 'login',
      generatedAt: '2026-01-01T00:00:00.000Z',
      captures,
    });
  });

  it('defaults generatedAt to an ISO timestamp when not provided', () => {
    const manifest = buildManifest('login', []);
    expect(() => new Date(manifest.generatedAt).toISOString()).not.toThrow();
    expect(new Date(manifest.generatedAt).toISOString()).toBe(manifest.generatedAt);
  });
});

describe('flattenScreenshotHashes', () => {
  it('flattens per-capture, per-viewport hashes into one map', () => {
    const captures = [
      {
        name: 'dashboard-full',
        viewports: {
          desktop: { sha256: 'aaa' },
          mobile: { sha256: 'bbb' },
        },
      },
      {
        name: 'dashboard-filters',
        viewports: { desktop: { sha256: 'ccc' } },
      },
    ];
    expect(flattenScreenshotHashes(captures)).toEqual({
      'dashboard-full@desktop': 'aaa',
      'dashboard-full@mobile': 'bbb',
      'dashboard-filters@desktop': 'ccc',
    });
  });

  it('returns an empty object for no captures', () => {
    expect(flattenScreenshotHashes([])).toEqual({});
  });
});

describe('loadManifest / saveManifestEntry', () => {
  const tmpDirs = [];

  afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  });

  function tmpManifestPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-manifest-test-'));
    tmpDirs.push(dir);
    return path.join(dir, 'manifest.json');
  }

  it('returns an empty object when the manifest file does not exist yet', () => {
    expect(loadManifest(tmpManifestPath())).toEqual({});
  });

  it('creates the manifest file with a single tour entry', () => {
    const manifestPath = tmpManifestPath();
    const manifest = buildManifest('login', [{ name: 'login-full' }], '2026-01-01T00:00:00.000Z');
    saveManifestEntry(manifestPath, manifest);
    expect(loadManifest(manifestPath)).toEqual({ login: manifest });
  });

  it('merges with existing entries for other tours instead of overwriting them', () => {
    const manifestPath = tmpManifestPath();
    saveManifestEntry(manifestPath, buildManifest('login', [], '2026-01-01T00:00:00.000Z'));
    saveManifestEntry(manifestPath, buildManifest('dashboard', [], '2026-01-02T00:00:00.000Z'));
    expect(Object.keys(loadManifest(manifestPath)).sort()).toEqual(['dashboard', 'login']);
  });
});
