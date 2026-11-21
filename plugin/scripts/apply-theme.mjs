// Writes .docsolace/app-theme.json into the docs site: one marked block in
// site/src/css/custom.css, the favicon/logo copied into site/static/img and
// wired into site/docusaurus.config.js, and colorMode set to follow the app.
// Idempotent; leaves every other rule/setting alone. A no-op (exit 0, with a
// note) when there's no theme file or no site yet. Anything it can't wire up
// automatically is reported with what to set by hand.
import fs from 'node:fs';
import path from 'node:path';
import { applyThemeBlock, buildThemeCss, colorModePlan, validateTheme } from './lib/app-theme.mjs';
import { readJsonFile } from './lib/fs-atomic.mjs';
import { resetColorMode, setColorMode, setFavicon, setNavbarLogo } from './lib/site-config.mjs';

const THEME_FILE = '.docsolace/app-theme.json';
const ASSET_DIR = '.docsolace/app-assets';
const CSS_FILE = 'site/src/css/custom.css';
const CONFIG_FILE = 'site/docusaurus.config.js';
const STATIC_IMG = 'site/static/img';

function copyAsset(file) {
  const from = path.join(ASSET_DIR, file);
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(STATIC_IMG, { recursive: true });
  fs.copyFileSync(from, path.join(STATIC_IMG, file));
  return true;
}

// Earlier runs may have left app-logo.png behind after the logo became an SVG.
// Only a file whose kind has a current replacement is removed — with no new
// favicon, the old one stays, since the site config may still point at it.
function removeStaleAssets(current) {
  if (!fs.existsSync(STATIC_IMG)) return [];
  const kinds = new Set([...current].map((f) => /^app-(favicon|logo)/.exec(f)[1]));
  const removed = [];
  for (const f of fs.readdirSync(STATIC_IMG)) {
    const m = /^app-(favicon|logo)\.[a-z]+$/.exec(f);
    if (m && kinds.has(m[1]) && !current.has(f)) {
      fs.rmSync(path.join(STATIC_IMG, f));
      removed.push(f);
    }
  }
  return removed;
}

function main() {
  const raw = readJsonFile(THEME_FILE, null);
  if (!raw) {
    console.log(`No ${THEME_FILE} yet — run theme-scan.mjs first.`);
    return;
  }
  if (!fs.existsSync(CSS_FILE)) {
    console.log(`No ${CSS_FILE} yet — run /document init-site first; the theme will be applied then.`);
    return;
  }
  const theme = validateTheme(raw);
  const report = [];

  const block = buildThemeCss(theme);
  if (block) {
    const before = fs.readFileSync(CSS_FILE, 'utf8');
    const after = applyThemeBlock(before, block);
    if (after !== before) fs.writeFileSync(CSS_FILE, after);
    report.push(after !== before ? `theme colors/fonts written to ${CSS_FILE}` : `${CSS_FILE} already up to date`);
  } else {
    report.push('no usable colors or fonts in the saved theme');
  }

  if (fs.existsSync(CONFIG_FILE)) {
    let config = fs.readFileSync(CONFIG_FILE, 'utf8');
    const original = config;
    const step = (label, result) => {
      if (result.applied) config = result.text;
      report.push(result.applied ? `${label} set` : `${label} NOT set automatically (${result.reason}) — set it by hand in ${CONFIG_FILE}`);
    };
    const current = new Set();
    if (theme.assets?.favicon) {
      if (copyAsset(theme.assets.favicon)) {
        current.add(theme.assets.favicon);
        step('favicon', setFavicon(config, `img/${theme.assets.favicon}`));
      } else report.push(`favicon file ${theme.assets.favicon} is missing from ${ASSET_DIR} — re-run theme-scan.mjs`);
    }
    if (theme.assets?.logo) {
      if (copyAsset(theme.assets.logo.file)) {
        current.add(theme.assets.logo.file);
        step('navbar logo', setNavbarLogo(config, { src: `img/${theme.assets.logo.file}`, alt: theme.assets.logo.alt }));
      } else report.push(`logo file ${theme.assets.logo.file} is missing from ${ASSET_DIR} — re-run theme-scan.mjs`);
    }
    const removed = removeStaleAssets(current);
    if (removed.length > 0) report.push(`removed stale ${removed.join(', ')} from ${STATIC_IMG}`);
    const mode = colorModePlan(theme);
    if (mode?.reset) {
      const r = resetColorMode(config);
      if (r.applied) config = r.text;
    } else if (mode) step('color mode', setColorMode(config, mode));
    if (config !== original) fs.writeFileSync(CONFIG_FILE, config);
  } else if (theme.assets || colorModePlan(theme)) {
    report.push(`no ${CONFIG_FILE} — favicon, logo and color mode skipped`);
  }

  console.log(`Applied the app's ${theme.scheme}${theme.dark ? ' + dark' : ''} theme:`);
  for (const line of report) console.log(`  - ${line}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
