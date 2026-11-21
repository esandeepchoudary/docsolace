// Writes .docsolace/app-theme.json into the docs site's theme as one marked
// block in site/src/css/custom.css. Idempotent; leaves every other rule alone.
// A no-op (exit 0, with a note) when there's no theme file or no site yet.
import fs from 'node:fs';
import { applyThemeBlock, buildThemeCss } from './lib/app-theme.mjs';
import { readJsonFile } from './lib/fs-atomic.mjs';

const THEME_FILE = '.docsolace/app-theme.json';
const CSS_FILE = 'site/src/css/custom.css';

function main() {
  const theme = readJsonFile(THEME_FILE, null);
  if (!theme) {
    console.log(`No ${THEME_FILE} yet — run theme-scan.mjs first.`);
    return;
  }
  if (!fs.existsSync(CSS_FILE)) {
    console.log(`No ${CSS_FILE} yet — run /document init-site first; the theme will be applied then.`);
    return;
  }
  const block = buildThemeCss(theme);
  if (!block) {
    console.log('The saved theme has no usable values — nothing applied.');
    return;
  }
  const before = fs.readFileSync(CSS_FILE, 'utf8');
  const after = applyThemeBlock(before, block);
  if (after === before) {
    console.log(`${CSS_FILE} already matches the saved app theme.`);
    return;
  }
  fs.writeFileSync(CSS_FILE, after);
  const scheme = theme.scheme === 'dark' ? 'dark' : 'light';
  console.log(`Applied the app's ${scheme} theme to ${CSS_FILE}.`);
  if (scheme === 'dark') {
    console.log(
      "The app is dark: set colorMode.defaultMode to 'dark' in site/docusaurus.config.js so the docs open in it.",
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
