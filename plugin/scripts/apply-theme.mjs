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
import { setColorMode, setFavicon, setNavbarLogo } from './lib/site-config.mjs';

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
    if (theme.assets?.favicon && copyAsset(theme.assets.favicon)) step('favicon', setFavicon(config, `img/${theme.assets.favicon}`));
    if (theme.assets?.logo && copyAsset(theme.assets.logo.file)) {
      step('navbar logo', setNavbarLogo(config, { src: `img/${theme.assets.logo.file}`, alt: theme.assets.logo.alt }));
    }
    const mode = colorModePlan(theme);
    if (mode) step('color mode', setColorMode(config, mode));
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
