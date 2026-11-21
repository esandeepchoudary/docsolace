// Reads the running app's look (colors, fonts, corner radius) and saves it to
// .docsolace/app-theme.json (committed — the docs site's theme derives from
// it, so it must be reproducible and reviewable). Read-only against the app:
// one page load, no clicks, no form input.
//
//   node theme-scan.mjs [--path /some/page]
//
// Defaults to the first page a tour visits without needing a login, else "/".
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';
import { extractThemeFromPage, validateTheme } from './lib/app-theme.mjs';
import { SLUG_RE, loadTour } from './lib/tours.mjs';

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

async function main() {
  const config = loadConfig('docsolace.config.yaml');
  const pagePath = argValue('--path') ?? defaultPath();
  if (!/^\/(?!\/)/.test(pagePath)) throw new Error(`--path must be site-relative (got "${pagePath}")`);

  const browser = await chromium.launch({ args: config.launchArgs ?? [] });
  try {
    const page = await browser.newPage();
    await page.goto(`${config.baseUrl}${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const theme = validateTheme(await extractThemeFromPage(page));
    if (!theme.colors.primary && !theme.colors.background && !theme.fonts.body) {
      throw new Error(`Couldn't read any usable colors or fonts from ${config.baseUrl}${pagePath}.`);
    }
    const outPath = path.join('.docsolace', 'app-theme.json');
    fs.mkdirSync('.docsolace', { recursive: true });
    writeFileAtomic(outPath, `${JSON.stringify({ source: `${pagePath}`, ...theme }, null, 2)}\n`);
    console.log(`Saved ${outPath} (read from ${pagePath}).`);
    console.log(JSON.stringify(theme, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
