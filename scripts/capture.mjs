// Phase 0: minimal, hardcoded capture — proves a deterministic screenshot
// lands for the `login` tour. Phase 1 replaces this with a full tour-YAML
// step executor (preconditions, goto/click/capture, masking).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { load as parseYaml } from 'js-yaml';

function parseArgs(argv) {
  const args = { tour: 'login' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
  }
  return args;
}

const { tour: tourId } = parseArgs(process.argv.slice(2));
if (tourId !== 'login') {
  console.error(`Phase 0 only supports the "login" tour, got "${tourId}".`);
  process.exit(1);
}

const config = parseYaml(fs.readFileSync('autodocs.config.yaml', 'utf8'));
const outDir = path.join(config.outputDir, 'screenshots', tourId);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: config.viewport });
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(`${config.baseUrl}/login`, { waitUntil: 'networkidle' });

const outPath = path.join(outDir, 'login-full.png');
await page.screenshot({ path: outPath });
await browser.close();

console.log(`Captured ${tourId} -> ${outPath}`);
