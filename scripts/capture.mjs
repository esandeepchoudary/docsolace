// Phase 1: tour-driven capture runner. Reads a tour YAML, applies its
// preconditions (auth via storage-state reuse), executes its steps in
// order, and writes <capture>.png + <capture>.a11y.json per capture plus a
// manifest.json entry with a SHA-256 computed on the masked screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { sha256Buffer, buildManifest } from './lib/manifest.mjs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const MASK_COLOR = '#FF00FF';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
  }
  if (!args.tour) {
    console.error('Usage: capture.mjs --tour <tour-id>');
    process.exit(1);
  }
  return args;
}

async function ensureAuthState(browser, config, authProfileId) {
  const profile = config.auth?.[authProfileId];
  if (!profile) {
    throw new Error(`Auth profile "${authProfileId}" not found in autodocs.config.yaml`);
  }

  const authDir = path.join(config.outputDir, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  const statePath = path.join(authDir, `${authProfileId}.json`);
  if (fs.existsSync(statePath)) return statePath;

  const username = process.env[profile.usernameEnv];
  const password = process.env[profile.passwordEnv];
  if (!username || !password) {
    throw new Error(
      `Missing credentials for auth profile "${authProfileId}": set ` +
        `${profile.usernameEnv} and ${profile.passwordEnv} (see .env.example).`,
    );
  }

  const context = await browser.newContext({ viewport: config.viewport });
  const page = await context.newPage();
  await page.goto(`${config.baseUrl}${profile.loginUrl}`, { waitUntil: 'networkidle' });
  await page.fill(profile.usernameSelector, username);
  await page.fill(profile.passwordSelector, password);
  await page.click(profile.submitSelector);
  await page.waitForURL(profile.successUrlPattern);
  await page.waitForLoadState('networkidle');
  await context.storageState({ path: statePath });
  await context.close();
  return statePath;
}

async function runTour(browser, config, tour) {
  const screenshotsDir = path.join(config.outputDir, 'screenshots', tour.id);
  const snapshotsDir = path.join(config.outputDir, 'snapshots', tour.id);
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(snapshotsDir, { recursive: true });

  let storageState;
  if (tour.preconditions?.auth) {
    storageState = await ensureAuthState(browser, config, tour.preconditions.auth);
  }

  const context = await browser.newContext({ viewport: config.viewport, storageState });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const captures = [];

  for (const [index, step] of tour.steps.entries()) {
    if (step.action === 'goto') {
      await page.goto(`${config.baseUrl}${step.path}`, { waitUntil: 'networkidle' });
    } else if (step.action === 'click') {
      await page.locator(step.selector).click();
      await page.waitForLoadState('networkidle');
    } else if (step.capture) {
      const maskLocators = (step.mask ?? []).map((selector) => page.locator(selector));
      const pngPath = path.join(screenshotsDir, `${step.capture}.png`);
      await page.screenshot({ path: pngPath, mask: maskLocators, maskColor: MASK_COLOR });

      const ariaSnapshot = await page.locator('body').ariaSnapshot();
      const a11yPath = path.join(snapshotsDir, `${step.capture}.a11y.json`);
      fs.writeFileSync(
        a11yPath,
        JSON.stringify({ capture: step.capture, description: step.description ?? null, ariaSnapshot }, null, 2),
      );

      captures.push({
        name: step.capture,
        description: step.description ?? null,
        png: path.relative(config.outputDir, pngPath),
        a11y: path.relative(config.outputDir, a11yPath),
        sha256: sha256Buffer(fs.readFileSync(pngPath)),
      });
    } else {
      throw new Error(`Tour "${tour.id}" step ${index} is neither a goto/click action nor a capture`);
    }
  }

  await context.close();
  return buildManifest(tour.id, captures);
}

function writeManifestEntry(config, manifest) {
  const manifestPath = path.join(config.outputDir, 'manifest.json');
  const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  existing[manifest.tourId] = manifest;
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2));
}

const { tour: tourId } = parseArgs(process.argv.slice(2));
const config = loadConfig('autodocs.config.yaml');
const tour = loadTour('tours', tourId);

const browser = await chromium.launch();
try {
  const manifest = await runTour(browser, config, tour);
  writeManifestEntry(config, manifest);
  console.log(`Captured ${tour.id}: ${manifest.captures.length} capture(s).`);
  for (const c of manifest.captures) {
    console.log(`  - ${c.name}: ${c.png} (sha256 ${c.sha256.slice(0, 12)}...)`);
  }
} finally {
  await browser.close();
}
