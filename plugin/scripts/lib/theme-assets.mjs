// The testable core of theme-scan.mjs: saving fetched brand assets without ever
// losing a good one, and deciding when a lower-confidence read must not replace
// a theme that came from the live app.
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeAlt } from './app-theme.mjs';
import { fetchBrandAsset } from './brand-assets.mjs';

// Fetches first; only replaces what was successfully re-fetched, so a transient
// failure (a 500, a timeout) never deletes the previously committed asset.
// Returns the theme's `assets` entry (only for what was saved this run).
export async function saveAssets(raw, baseUrl, notes, { assetDir, fetchImpl } = {}) {
  const opts = fetchImpl ? { fetchImpl } : {};
  const favicon = raw.assets?.favicon ? await fetchBrandAsset(raw.assets.favicon, baseUrl, opts) : null;
  const logo = raw.assets?.logo?.src ? await fetchBrandAsset(raw.assets.logo.src, baseUrl, opts) : null;
  if (favicon && !favicon.data) notes.push(`favicon skipped: ${favicon.skipped}`);
  if (logo && !logo.data) notes.push(`logo skipped: ${logo.skipped}`);
  fs.mkdirSync(assetDir, { recursive: true });
  const clear = (prefix) => {
    for (const f of fs.readdirSync(assetDir)) if (f.startsWith(`${prefix}.`)) fs.rmSync(path.join(assetDir, f));
  };
  const assets = {};
  if (favicon?.data) {
    clear('app-favicon');
    assets.favicon = `app-favicon.${favicon.ext}`;
    fs.writeFileSync(path.join(assetDir, assets.favicon), favicon.data);
  }
  if (logo?.data) {
    clear('app-logo');
    const file = `app-logo.${logo.ext}`;
    fs.writeFileSync(path.join(assetDir, file), logo.data);
    assets.logo = { file, alt: sanitizeAlt(raw.assets.logo.alt) ?? 'Logo' };
  }
  return assets;
}

// When a fresh scan couldn't load the app and fell back to source CSS, keep an
// existing theme that was read from the live app: the CSS read would drop its
// dark variant, assets and radius.
export function shouldKeepExistingTheme({ fellBack, existing }) {
  return Boolean(fellBack && existing && existing.confidence === 'live app');
}

// With a live scan, carry forward asset references from the previous theme for
// anything that wasn't (re)fetched this time and whose file still exists — a
// transient failure must not drop the favicon or logo from the theme.
export function carryForwardAssets(fresh, previous, assetDir) {
  const out = { ...(fresh ?? {}) };
  const prev = previous?.assets ?? {};
  if (!out.favicon && prev.favicon && fs.existsSync(path.join(assetDir, prev.favicon))) out.favicon = prev.favicon;
  if (!out.logo && prev.logo?.file && fs.existsSync(path.join(assetDir, prev.logo.file))) out.logo = prev.logo;
  return Object.keys(out).length > 0 ? out : undefined;
}
