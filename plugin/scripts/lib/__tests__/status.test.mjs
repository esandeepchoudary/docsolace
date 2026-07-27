import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeTourStatus, computeProductPageStatus, findAnomalies } from '../status.mjs';
import { computeCodePathsHash } from '../drift.mjs';

const tmpDirs = [];

function mkTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-status-test-'));
  tmpDirs.push(dir);
  return dir;
}

function writeDoc(docsDir, id) {
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, `${id}.md`), `# ${id}\n`);
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function tourManifest(hashes) {
  return { captures: [{ name: 'full', viewports: Object.fromEntries(Object.entries(hashes).map(([vp, sha]) => [vp, { sha256: sha }])) }] };
}

describe('computeTourStatus', () => {
  it('reports the draft gate without touching manifest/state', () => {
    const status = computeTourStatus({ tour: { id: 'x', maturity: 'draft' } });
    expect(status).toMatchObject({ gate: 'draft', dirty: false, reasons: [] });
  });

  it('reports the proposed gate', () => {
    const status = computeTourStatus({ tour: { id: 'x', status: 'proposed' } });
    expect(status.gate).toBe('proposed');
  });

  it('reports the archived gate', () => {
    const status = computeTourStatus({ tour: { id: 'x', status: 'archived' } });
    expect(status.gate).toBe('archived');
  });

  it('reports uncaptured when there is no manifest entry for an active tour', () => {
    const status = computeTourStatus({ tour: { id: 'x' }, tourManifest: undefined });
    expect(status).toMatchObject({ gate: 'uncaptured', dirty: true, reasons: ['never-captured'] });
  });

  it('reports dirty with never-generated when captured but never generated before', () => {
    const dir = mkTmpDir();
    const status = computeTourStatus({
      tour: { id: 'x', code_paths: [] },
      tourManifest: tourManifest({ desktop: 'abc' }),
      previousEntry: undefined,
      currentRenderHash: 'r1',
      cwd: dir,
      docsDir: path.join(dir, 'docs'),
    });
    expect(status.dirty).toBe(true);
    expect(status.reasons).toEqual(['never-generated']);
    expect(status.hasPage).toBe(false);
    expect(status.generatedAt).toBeNull();
  });

  it('reports clean and surfaces generatedAt/generatedAtCommit from the previous state entry', () => {
    const dir = mkTmpDir();
    const docsDir = path.join(dir, 'docs');
    writeDoc(docsDir, 'x');
    const status = computeTourStatus({
      tour: { id: 'x', code_paths: [] },
      tourManifest: tourManifest({ desktop: 'abc' }),
      previousEntry: {
        screenshotHashes: { 'full@desktop': 'abc' },
        codePathsHash: computeCodePathsHash([], dir),
        renderHash: 'r1',
        generatedAt: '2026-07-20T00:00:00.000Z',
        generatedAtCommit: 'a1b2c3d',
      },
      currentRenderHash: 'r1',
      cwd: dir,
      docsDir,
    });
    expect(status.dirty).toBe(false);
    expect(status.hasPage).toBe(true);
    expect(status.generatedAt).toBe('2026-07-20T00:00:00.000Z');
    expect(status.generatedAtCommit).toBe('a1b2c3d');
  });

  it('reports renderOnly when only the render hash changed', () => {
    const dir = mkTmpDir();
    const status = computeTourStatus({
      tour: { id: 'x', code_paths: [] },
      tourManifest: tourManifest({ desktop: 'abc' }),
      previousEntry: {
        screenshotHashes: { 'full@desktop': 'abc' },
        codePathsHash: computeCodePathsHash([], dir),
        renderHash: 'old',
      },
      currentRenderHash: 'new',
      cwd: dir,
      docsDir: path.join(dir, 'docs'),
    });
    expect(status.dirty).toBe(true);
    expect(status.reasons).toEqual(['render']);
    expect(status.renderOnly).toBe(true);
  });
});

describe('computeProductPageStatus', () => {
  it('surfaces per-page generatedAt/generatedAtCommit from the shared product state entry', () => {
    const dir = mkTmpDir();
    const docsDir = path.join(dir, 'docs');
    writeDoc(docsDir, 'overview');
    const status = computeProductPageStatus({
      page: { id: 'overview' },
      previousEntry: { pages: { overview: { generatedAt: '2026-07-01T00:00:00.000Z', generatedAtCommit: '9988776' } } },
      productDirty: false,
      productReasons: [],
      docsDir,
    });
    expect(status).toMatchObject({
      id: 'overview',
      hasPage: true,
      generatedAt: '2026-07-01T00:00:00.000Z',
      generatedAtCommit: '9988776',
      dirty: false,
    });
  });

  it('reports hasPage false and null timestamps for a page never generated', () => {
    const dir = mkTmpDir();
    const status = computeProductPageStatus({
      page: { id: 'concepts' },
      previousEntry: undefined,
      productDirty: true,
      productReasons: ['never-generated'],
      docsDir: path.join(dir, 'docs'),
    });
    expect(status).toMatchObject({ hasPage: false, generatedAt: null, generatedAtCommit: null, dirty: true });
  });
});

describe('findAnomalies', () => {
  it('flags a published tour with no generated page yet', () => {
    const dir = mkTmpDir();
    const docsDir = path.join(dir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    const anomalies = findAnomalies({
      tours: [{ id: 'login', maturity: 'stable', status: 'confirmed' }],
      productPageIds: [],
      docsDir,
    });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatch(/"login" is confirmed\/stable but has no generated page/);
  });

  it('does not flag a draft/proposed/archived tour for having no page', () => {
    const dir = mkTmpDir();
    const docsDir = path.join(dir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    const anomalies = findAnomalies({
      tours: [
        { id: 'a', maturity: 'draft' },
        { id: 'b', status: 'proposed' },
        { id: 'c', status: 'archived' },
      ],
      productPageIds: [],
      docsDir,
    });
    expect(anomalies).toEqual([]);
  });

  it('flags a docs/*.md page matching no tour id or product page id', () => {
    const dir = mkTmpDir();
    const docsDir = path.join(dir, 'docs');
    writeDoc(docsDir, 'mystery-page');
    const anomalies = findAnomalies({ tours: [], productPageIds: [], docsDir });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatch(/"docs\/mystery-page\.md" exists but matches no tour/);
  });

  it('does not flag a page matching a real tour id or an enabled product page id', () => {
    const dir = mkTmpDir();
    const docsDir = path.join(dir, 'docs');
    writeDoc(docsDir, 'login');
    writeDoc(docsDir, 'overview');
    const anomalies = findAnomalies({
      tours: [{ id: 'login', maturity: 'stable', status: 'confirmed' }],
      productPageIds: ['overview'],
      docsDir,
    });
    expect(anomalies).toEqual([]);
  });

  it('is a no-op when docs/ does not exist yet', () => {
    const dir = mkTmpDir();
    const anomalies = findAnomalies({ tours: [], productPageIds: [], docsDir: path.join(dir, 'docs') });
    expect(anomalies).toEqual([]);
  });
});
