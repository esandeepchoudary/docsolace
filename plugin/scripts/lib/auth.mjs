import fs from 'node:fs';
import path from 'node:path';
import { withRetry } from './retry.mjs';

// Shared by capture.mjs and crawl.mjs so a crawl can walk pages behind login
// exactly the same way a capture does — extracted out of capture.mjs rather
// than duplicated, since a second copy would inevitably drift on the
// storageStatePath-vs-scripted-login branching.
export function primaryViewport(config) {
  return Object.values(config.viewports)[0];
}

export async function ensureAuthState(browser, config, authProfileId) {
  const profile = config.auth?.[authProfileId];
  if (!profile) {
    throw new Error(`Auth profile "${authProfileId}" not found in docsolace.config.yaml`);
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

  // try/finally guarantees this context is closed even if a login step
  // fails (bad selector, slow app) — matches the cleanup discipline every
  // other Playwright context in this codebase already follows (capture.mjs's
  // runTour, crawl.mjs's runPass).
  const context = await browser.newContext({ viewport: primaryViewport(config) });
  try {
    const page = await context.newPage();
    await withRetry(() => page.goto(`${config.baseUrl}${profile.loginUrl}`, { waitUntil: 'networkidle' }));
    await page.fill(profile.usernameSelector, username);
    await page.fill(profile.passwordSelector, password);
    await page.click(profile.submitSelector);
    await page.waitForURL(profile.successUrlPattern);
    await page.waitForLoadState('networkidle');
    await context.storageState({ path: statePath });
  } finally {
    await context.close();
  }
  return statePath;
}
