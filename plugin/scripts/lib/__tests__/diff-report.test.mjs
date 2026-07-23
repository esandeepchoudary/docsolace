import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectDiffEntries, renderDiffReport } from '../diff-report.mjs';

describe('renderDiffReport', () => {
  it('renders a message when there are no entries', () => {
    const html = renderDiffReport([]);
    expect(html).toContain('No pending screenshot changes to review.');
    expect(html).toContain('0 changes pending');
  });

  it('renders one section per entry with before/after/diff images', () => {
    const html = renderDiffReport([
      {
        tourId: 'dashboard-overview',
        capture: 'dashboard-full',
        viewport: 'desktop',
        beforePath: 'diffs/dashboard-overview/dashboard-full@desktop.before.png',
        afterPath: 'images/dashboard-overview/dashboard-full@desktop.png',
        diffPath: 'diffs/dashboard-overview/dashboard-full@desktop.diff.png',
      },
    ]);
    expect(html).toContain('dashboard-overview');
    expect(html).toContain('dashboard-full');
    expect(html).toContain('(desktop)');
    expect(html).toContain('src="diffs/dashboard-overview/dashboard-full@desktop.before.png"');
    expect(html).toContain('src="images/dashboard-overview/dashboard-full@desktop.png"');
    expect(html).toContain('src="diffs/dashboard-overview/dashboard-full@desktop.diff.png"');
    expect(html).toContain('1 change pending');
  });

  it('escapes HTML-significant characters in entry fields', () => {
    const html = renderDiffReport([
      {
        tourId: '<script>alert(1)</script>',
        capture: 'x',
        viewport: 'desktop',
        beforePath: 'a.png',
        afterPath: 'b.png',
        diffPath: 'c.png',
      },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a "dimensions changed" note instead of a broken <img> when diffPath is null', () => {
    const html = renderDiffReport([
      {
        tourId: 'dashboard-overview',
        capture: 'dashboard-full',
        viewport: 'desktop',
        beforePath: 'diffs/dashboard-overview/dashboard-full@desktop.before.png',
        afterPath: 'images/dashboard-overview/dashboard-full@desktop.png',
        diffPath: null,
      },
    ]);
    expect(html).toContain('Dimensions changed — no pixel diff available.');
    expect(html).not.toContain('alt="diff"');
    // Before/after still render — only the diff visualization is missing.
    expect(html).toContain('src="diffs/dashboard-overview/dashboard-full@desktop.before.png"');
    expect(html).toContain('src="images/dashboard-overview/dashboard-full@desktop.png"');
  });
});

describe('collectDiffEntries', () => {
  const tmpDirs = [];
  afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  });

  function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-diff-report-test-'));
    tmpDirs.push(root);
    const outputDir = path.join(root, '.autodocs', 'artifacts');
    const diffsRoot = path.join(outputDir, 'diffs');
    return { root, outputDir, diffsRoot };
  }

  it('returns no entries when the diffs directory does not exist yet', () => {
    const { outputDir, diffsRoot } = setup();
    expect(collectDiffEntries({ diffsRoot, outputDir })).toEqual([]);
  });

  it('collects an entry that has both a .before.png and a .diff.png', () => {
    const { root, outputDir, diffsRoot } = setup();
    const tourDir = path.join(diffsRoot, 'dashboard-overview');
    fs.mkdirSync(tourDir, { recursive: true });
    fs.writeFileSync(path.join(tourDir, 'dashboard-full@desktop.before.png'), 'before');
    fs.writeFileSync(path.join(tourDir, 'dashboard-full@desktop.diff.png'), 'diff');
    const afterDir = path.join(root, 'docs', 'images', 'dashboard-overview');
    fs.mkdirSync(afterDir, { recursive: true });
    fs.writeFileSync(path.join(afterDir, 'dashboard-full@desktop.png'), 'after');

    const cwd = process.cwd();
    process.chdir(root);
    try {
      const entries = collectDiffEntries({ diffsRoot, outputDir });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ tourId: 'dashboard-overview', capture: 'dashboard-full', viewport: 'desktop' });
      expect(entries[0].diffPath).not.toBeNull();
    } finally {
      process.chdir(cwd);
    }
  });

  it('still collects an entry when only .before.png exists (dimensions changed, no diff image)', () => {
    const { root, outputDir, diffsRoot } = setup();
    const tourDir = path.join(diffsRoot, 'dashboard-overview');
    fs.mkdirSync(tourDir, { recursive: true });
    fs.writeFileSync(path.join(tourDir, 'dashboard-full@desktop.before.png'), 'before');
    // Deliberately no .diff.png — this is the exact scenario writeDiffImage
    // produces on a dimension mismatch (lib/pixel-diff.mjs).
    const afterDir = path.join(root, 'docs', 'images', 'dashboard-overview');
    fs.mkdirSync(afterDir, { recursive: true });
    fs.writeFileSync(path.join(afterDir, 'dashboard-full@desktop.png'), 'after');

    const cwd = process.cwd();
    process.chdir(root);
    try {
      const entries = collectDiffEntries({ diffsRoot, outputDir });
      expect(entries).toHaveLength(1);
      expect(entries[0].diffPath).toBeNull();
      expect(entries[0].beforePath).toBeTruthy();
      expect(entries[0].afterPath).toBeTruthy();
    } finally {
      process.chdir(cwd);
    }
  });

  it('skips an entry whose after image was never generated', () => {
    const { root, outputDir, diffsRoot } = setup();
    const tourDir = path.join(diffsRoot, 'dashboard-overview');
    fs.mkdirSync(tourDir, { recursive: true });
    fs.writeFileSync(path.join(tourDir, 'dashboard-full@desktop.before.png'), 'before');
    // No docs/images/... after file written at all.

    const cwd = process.cwd();
    process.chdir(root);
    try {
      expect(collectDiffEntries({ diffsRoot, outputDir })).toEqual([]);
    } finally {
      process.chdir(cwd);
    }
  });
});
