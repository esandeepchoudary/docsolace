import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { computeA11yHash, resolveEffectiveScreenshotHashes } from '../visual-drift.mjs';
import { getDirtyReasons, isTourDirty } from '../drift.mjs';

const dirs = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

function png(file, { changedPixels = 0, size = 100 } = {}) {
  const img = new PNG({ width: size, height: size });
  img.data.fill(255);
  for (let i = 0; i < changedPixels; i++) {
    const o = i * 4;
    img.data[o] = 0;
    img.data[o + 1] = 0;
    img.data[o + 2] = 0;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(img));
}

function setup({ changedPixels }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-vd-'));
  dirs.push(root);
  const out = path.join(root, 'artifacts');
  const docs = path.join(root, 'docs');
  png(path.join(docs, 'images', 't', 'home@desktop.png'));
  png(path.join(out, 'screenshots/t/home@desktop.png'), { changedPixels });
  const captures = [{ name: 'home', viewports: { desktop: { png: 'screenshots/t/home@desktop.png', sha256: 'NEW' } } }];
  return { out, docs, captures };
}

describe('resolveEffectiveScreenshotHashes', () => {
  it('keeps the previous hash for sub-threshold pixel noise', () => {
    const { out, docs, captures } = setup({ changedPixels: 5 }); // 0.05%
    const result = resolveEffectiveScreenshotHashes({
      tourId: 't', captures, previousEntry: { screenshotHashes: { 'home@desktop': 'OLD' } }, outputDir: out, docsDir: docs,
    });
    expect(result['home@desktop']).toBe('OLD');
    expect(isTourDirty({
      tour: { maturity: 'stable' }, previousEntry: { screenshotHashes: { 'home@desktop': 'OLD' }, codePathsHash: 'c' },
      currentScreenshotHashes: result, currentCodePathsHash: 'c',
    })).toBe(false);
  });

  it('reports a real visual change above the threshold', () => {
    const { out, docs, captures } = setup({ changedPixels: 2000 }); // 20%
    const result = resolveEffectiveScreenshotHashes({
      tourId: 't', captures, previousEntry: { screenshotHashes: { 'home@desktop': 'OLD' } }, outputDir: out, docsDir: docs,
    });
    expect(result['home@desktop']).toBe('NEW');
  });

  it('is unchanged when there is no previous entry or no published image', () => {
    const { out, docs, captures } = setup({ changedPixels: 5 });
    expect(resolveEffectiveScreenshotHashes({ tourId: 't', captures, previousEntry: undefined, outputDir: out, docsDir: docs })['home@desktop']).toBe('NEW');
    fs.rmSync(path.join(docs, 'images'), { recursive: true });
    expect(resolveEffectiveScreenshotHashes({
      tourId: 't', captures, previousEntry: { screenshotHashes: { 'home@desktop': 'OLD' } }, outputDir: out, docsDir: docs,
    })['home@desktop']).toBe('NEW');
  });
});

describe('semantic drift', () => {
  it('a snapshot change is its own dirty reason even with identical pixels', () => {
    const base = { previousEntry: { screenshotHashes: { a: 'x' }, codePathsHash: 'c', a11yHash: 'one' }, currentScreenshotHashes: { a: 'x' }, currentCodePathsHash: 'c' };
    expect(getDirtyReasons({ ...base, currentA11yHash: 'one' })).toEqual([]);
    expect(getDirtyReasons({ ...base, currentA11yHash: 'two' })).toEqual(['semantics']);
  });

  it('does not regenerate state that predates the a11y hash', () => {
    expect(getDirtyReasons({
      previousEntry: { screenshotHashes: {}, codePathsHash: 'c' }, currentScreenshotHashes: {}, currentCodePathsHash: 'c', currentA11yHash: 'two',
    })).toEqual([]);
  });

  it('computeA11yHash follows snapshot contents, including the step description', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-a11y-'));
    dirs.push(root);
    const caps = [{ name: 'h', viewports: { desktop: { a11y: 'h.json' } } }];
    fs.writeFileSync(path.join(root, 'h.json'), '{"ariaSnapshot":"- button \\"Save\\""}');
    const a = computeA11yHash(caps, root);
    fs.writeFileSync(path.join(root, 'h.json'), '{"ariaSnapshot":"- button \\"Submit\\""}');
    expect(computeA11yHash(caps, root)).not.toBe(a);
    expect(computeA11yHash([{ name: 'x', viewports: { d: {} } }], root)).toBeUndefined();
  });
});
