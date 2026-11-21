import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { carryForwardAssets, saveAssets, shouldKeepExistingTheme } from '../theme-assets.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
const base = 'http://localhost:3000';
const dirs = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-ta-'));
  dirs.push(d);
  return d;
};
const serve = (routes) => async (url) => {
  const body = routes[new URL(url).pathname];
  return body === undefined ? new Response('', { status: 500 }) : new Response(body);
};
const raw = { assets: { favicon: `${base}/favicon.png`, logo: { src: `${base}/logo.svg`, alt: "Bob's Pizza" } } };

describe('saveAssets', () => {
  it('saves both, with a sanitized alt', async () => {
    const dir = tmp();
    const assets = await saveAssets(raw, base, [], { assetDir: dir, fetchImpl: serve({ '/favicon.png': PNG, '/logo.svg': SVG }) });
    expect(assets).toEqual({ favicon: 'app-favicon.png', logo: { file: 'app-logo.svg', alt: 'Bobs Pizza' } });
    expect(fs.readdirSync(dir).sort()).toEqual(['app-favicon.png', 'app-logo.svg']);
  });

  it('keeps the previously saved asset when a re-fetch fails', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'app-logo.svg'), 'OLD');
    const notes = [];
    const assets = await saveAssets(raw, base, notes, { assetDir: dir, fetchImpl: serve({ '/favicon.png': PNG }) }); // logo 500s
    expect(assets.logo).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'app-logo.svg'), 'utf8')).toBe('OLD');
    expect(notes.join()).toMatch(/logo skipped/);
  });

  it('replaces an older asset of a different format once the new one is fetched', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'app-logo.png'), 'OLD');
    await saveAssets(raw, base, [], { assetDir: dir, fetchImpl: serve({ '/favicon.png': PNG, '/logo.svg': SVG }) });
    expect(fs.existsSync(path.join(dir, 'app-logo.png'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'app-logo.svg'))).toBe(true);
  });
});

describe('shouldKeepExistingTheme', () => {
  it('only protects a live-app theme from a fallback read', () => {
    expect(shouldKeepExistingTheme({ fellBack: true, existing: { confidence: 'live app' } })).toBe(true);
    expect(shouldKeepExistingTheme({ fellBack: true, existing: { confidence: 'source CSS (x)' } })).toBe(false);
    expect(shouldKeepExistingTheme({ fellBack: true, existing: null })).toBe(false);
    expect(shouldKeepExistingTheme({ fellBack: false, existing: { confidence: 'live app' } })).toBe(false);
  });
});

describe('carryForwardAssets', () => {
  it('keeps a previous reference when its file is still there and nothing new was saved', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'app-favicon.png'), 'x');
    const previous = { assets: { favicon: 'app-favicon.png', logo: { file: 'app-logo.svg', alt: 'A' } } };
    expect(carryForwardAssets({}, previous, dir)).toEqual({ favicon: 'app-favicon.png' }); // logo file is gone
    expect(carryForwardAssets({ favicon: 'app-favicon.svg' }, previous, dir)).toEqual({ favicon: 'app-favicon.svg' });
    expect(carryForwardAssets({}, null, dir)).toBeUndefined();
  });
});
