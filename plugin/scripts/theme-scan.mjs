// Reads the app's look (colors, fonts, corner radius, favicon, logo) and saves
// it to .docsolace/app-theme.json + .docsolace/app-assets/ (committed — the
// docs site's theme derives from them, so they must be reproducible and
// reviewable). Read-only against the app: page loads only, no clicks, no form
// input. Loads the page under a light and a dark color scheme to find out
// whether the app has a dark theme of its own.
//
//   node theme-scan.mjs [--path /some/page]
//
// Defaults to the first page a tour visits without needing a login, else "/".
// If the app isn't running, falls back to reading the project's own CSS
// (lower confidence — it says so).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { fetchBrandAsset } from './lib/brand-assets.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';
import { extractThemeFromPage, mergeSchemes, sanitizeAlt, validateTheme } from './lib/app-theme.mjs';
import { scanSourceTheme } from './lib/source-theme.mjs';
import { SLUG_RE, loadTour } from './lib/tours.mjs';

const ASSET_DIR = path.join('.docsolace', 'app-assets');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function defaultPath() {
  if (!fs.existsSync('tours')) return '/';
  for (const f of fs.readdirSync('tours').filter((n) => n.endsWith('.yaml')).sort()) {
    const id = f.replace(/\.yaml$/, '');
    if (!SLUG_RE.test(id)) continue;
    try {
      const tour = loadTour('tours', id);
      if (tour.preconditions?.auth) continue;
      const goto = tour.steps.find((s) => s.action === 'goto');
      if (goto) return goto.path;
    } catch {
      // unreadable tour: skip
    }
  }
  return '/';
}

async function readScheme(browser, url, colorScheme) {
  const context = await browser.newContext({ colorScheme });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    return await extractThemeFromPage(page);
  } finally {
    await context.close();
  }
}

async function saveAssets(raw, baseUrl, notes) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  for (const f of fs.readdirSync(ASSET_DIR)) if (/^app-(favicon|logo)\./.test(f)) fs.rmSync(path.join(ASSET_DIR, f));
  const assets = {};
  if (raw.assets?.favicon) {
    const r = await fetchBrandAsset(raw.assets.favicon, baseUrl);
    if (r.data) {
      assets.favicon = `app-favicon.${r.ext}`;
      fs.writeFileSync(path.join(ASSET_DIR, assets.favicon), r.data);
    } else notes.push(`favicon skipped: ${r.skipped}`);
  }
  if (raw.assets?.logo?.src) {
    const r = await fetchBrandAsset(raw.assets.logo.src, baseUrl);
    if (r.data) {
      const file = `app-logo.${r.ext}`;
      fs.writeFileSync(path.join(ASSET_DIR, file), r.data);
      assets.logo = { file, alt: sanitizeAlt(raw.assets.logo.alt) ?? 'Logo' };
    } else notes.push(`logo skipped: ${r.skipped}`);
  }
  return assets;
}

async function main() {
  const config = loadConfig('docsolace.config.yaml');
  const pagePath = argValue('--path') ?? defaultPath();
  if (!/^\/(?!\/)/.test(pagePath)) throw new Error(`--path must be site-relative (got "${pagePath}")`);
  const url = `${config.baseUrl}${pagePath}`;
  const notes = [];

  let theme;
  let confidence = 'live app';
  let browser;
  try {
    browser = await chromium.launch({ args: config.launchArgs ?? [] });
    const lightRaw = await readScheme(browser, url, 'light');
    const darkRaw = await readScheme(browser, url, 'dark');
    const merged = mergeSchemes(lightRaw, darkRaw);
    theme = validateTheme(merged);
    const assets = await saveAssets(lightRaw, config.baseUrl, notes);
    if (Object.keys(assets).length > 0) theme.assets = assets;
  } catch (err) {
    notes.push(`couldn't load ${url} (${err.message.split('\n')[0]})`);
    const { theme: raw, files } = scanSourceTheme(process.cwd());
    theme = validateTheme(raw);
    confidence = `source CSS (${files.slice(0, 5).join(', ') || 'none found'}) — lower confidence, the app wasn't running`;
  } finally {
    await browser?.close();
  }

  if (!theme.colors.primary && !theme.colors.background && !theme.fonts.body) {
    throw new Error(`Couldn't read any usable colors or fonts (${notes.join('; ') || 'nothing found'}). Start the app and re-run.`);
  }
  fs.mkdirSync('.docsolace', { recursive: true });
  const outPath = path.join('.docsolace', 'app-theme.json');
  writeFileAtomic(outPath, `${JSON.stringify({ source: pagePath, confidence, ...theme }, null, 2)}\n`);
  console.log(`Saved ${outPath} from the ${confidence}.`);
  for (const n of notes) console.log(`  note: ${n}`);
  console.log(JSON.stringify(theme, null, 2));
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
