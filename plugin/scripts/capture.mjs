// Tour-driven capture runner. Reads a tour YAML, applies its preconditions
// (auth via storage-state reuse), executes its steps in order, and at each
// capture point shoots every configured viewport, writing
// <capture>@<viewport>.png + .a11y.json plus a manifest.json entry with a
// SHA-256 per viewport, computed on the masked screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { sha256Buffer, buildManifest, saveManifestEntry } from './lib/manifest.mjs';
import { mergeMasks } from './lib/masking.mjs';
import { resolveSeed } from './lib/seed.mjs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const MASK_COLOR = '#FF00FF';
const SEED_COMMAND_TIMEOUT_MS = 2 * 60 * 1000; // generous, but bounded — a hung seed script shouldn't hang capture

function parseArgs(argv) {
  const args = { allowSeedCommands: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tour') args.tour = argv[i + 1];
    if (argv[i] === '--allow-seed-commands') args.allowSeedCommands = true;
  }
  if (!args.tour) {
    console.error('Usage: capture.mjs --tour <tour-id> [--allow-seed-commands]');
    process.exit(1);
  }
  return args;
}

// Executes a seed's command (config-authored, see lib/seed.mjs's comment on
// why that's the trust boundary) in the project's own directory, streaming
// its output directly rather than buffering it, with a bounded timeout so a
// hung seed script can't hang capture indefinitely.
function runSeedCommand(command) {
  const result = spawnSync(command, { cwd: process.cwd(), shell: true, stdio: 'inherit', timeout: SEED_COMMAND_TIMEOUT_MS });
  if (result.error) {
    throw new Error(`Seed command failed to start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(
      `Seed command was killed by signal ${result.signal} (it may have exceeded the ` +
        `${SEED_COMMAND_TIMEOUT_MS}ms timeout).`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Seed command exited with status ${result.status}.`);
  }
}

// Applies a tour's preconditions.seed, if it has one, before anything else
// runs. Data seeding doesn't need a browser, so this happens before
// launching one — a failed or disabled seed is cheaper to fail fast on here.
function applySeed(config, seedId, { allowSeedCommands }) {
  const resolution = resolveSeed(config, seedId, { allowSeedCommands });
  switch (resolution.action) {
    case 'error':
      throw new Error(resolution.message);
    case 'noop':
    case 'skipped-disabled':
      console.log(resolution.message);
      return;
    case 'run':
      console.log(resolution.message);
      runSeedCommand(resolution.command);
      return;
    default:
      throw new Error(`Unknown seed resolution action "${resolution.action}"`);
  }
}

function primaryViewport(config) {
  return Object.values(config.viewports)[0];
}

async function ensureAuthState(browser, config, authProfileId) {
  const profile = config.auth?.[authProfileId];
  if (!profile) {
    throw new Error(`Auth profile "${authProfileId}" not found in autodocs.config.yaml`);
  }

  // Apps that can't be logged into with a scripted username/password fill —
  // OAuth, SSO, magic links, 2FA — use a pre-exported session instead: a
  // human logs in once, manually, via `save-auth-state.mjs`, and that
  // recorded session is reused directly. No scripted login is attempted.
  if (profile.storageStatePath) {
    if (!fs.existsSync(profile.storageStatePath)) {
      throw new Error(
        `Auth profile "${authProfileId}" has storageStatePath "${profile.storageStatePath}" ` +
          `but that file doesn't exist yet. In your own terminal (it opens a real, visible browser ` +
          `window — this can't run headless), run ` +
          `\`node "\${CLAUDE_PLUGIN_DATA}/scripts/save-auth-state.mjs" --profile ${authProfileId}\` ` +
          `(or the equivalent local path to save-auth-state.mjs) to log in once and record it. Pass ` +
          `--wait-for "<url-pattern>" to have it detect you're done automatically instead of waiting ` +
          `for you to press Enter.`,
      );
    }
    return profile.storageStatePath;
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

  const context = await browser.newContext({ viewport: primaryViewport(config) });
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

  // A context leaked from a failed step would otherwise outlive this
  // function (only browser.close() at the very end would reap it) —
  // try/finally guarantees it's closed on the success path and on any step
  // failure alike.
  const context = await browser.newContext({ viewport: primaryViewport(config), storageState });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const captures = [];

    for (const [index, step] of tour.steps.entries()) {
      try {
        if (step.action === 'goto') {
          await page.goto(`${config.baseUrl}${step.path}`, { waitUntil: 'networkidle' });
        } else if (step.action === 'click') {
          await page.locator(step.selector).click();
          await page.waitForLoadState('networkidle');
        } else if (step.capture) {
          const maskSelectors = mergeMasks(config.defaultMask, step.mask);
          const viewportShots = {};

          for (const [viewportName, viewportSize] of Object.entries(config.viewports)) {
            await page.setViewportSize(viewportSize);

            const maskLocators = maskSelectors.map((selector) => page.locator(selector));
            const pngPath = path.join(screenshotsDir, `${step.capture}@${viewportName}.png`);
            await page.screenshot({ path: pngPath, mask: maskLocators, maskColor: MASK_COLOR });

            const ariaSnapshot = await page.locator('body').ariaSnapshot();
            const a11yPath = path.join(snapshotsDir, `${step.capture}@${viewportName}.a11y.json`);
            fs.writeFileSync(
              a11yPath,
              JSON.stringify(
                { capture: step.capture, viewport: viewportName, description: step.description ?? null, ariaSnapshot },
                null,
                2,
              ),
            );

            viewportShots[viewportName] = {
              png: path.relative(config.outputDir, pngPath),
              a11y: path.relative(config.outputDir, a11yPath),
              sha256: sha256Buffer(fs.readFileSync(pngPath)),
            };
          }

          // Restore the primary viewport so subsequent goto/click steps
          // interact with the layout the tour was authored against.
          await page.setViewportSize(primaryViewport(config));

          captures.push({
            name: step.capture,
            description: step.description ?? null,
            viewports: viewportShots,
          });
        } else {
          throw new Error('is neither a goto/click action nor a capture');
        }
      } catch (err) {
        throw new Error(`Tour "${tour.id}" step ${index}: ${err.message}`);
      }
    }

    return buildManifest(tour.id, captures);
  } finally {
    await context.close();
  }
}

async function main() {
  const { tour: tourId, allowSeedCommands } = parseArgs(process.argv.slice(2));
  const config = loadConfig('autodocs.config.yaml');
  const tour = loadTour('tours', tourId);

  if (tour.preconditions?.seed) {
    applySeed(config, tour.preconditions.seed, {
      allowSeedCommands: allowSeedCommands || config.allowSeedCommands === true,
    });
  }

  const browser = await chromium.launch({ args: config.launchArgs ?? [] });
  try {
    const manifest = await runTour(browser, config, tour);
    saveManifestEntry(path.join(config.outputDir, 'manifest.json'), manifest);
    console.log(`Captured ${tour.id}: ${manifest.captures.length} capture(s).`);
    for (const c of manifest.captures) {
      const shots = Object.entries(c.viewports)
        .map(([name, v]) => `${name}=${v.sha256.slice(0, 8)}...`)
        .join(', ');
      console.log(`  - ${c.name}: ${shots}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
