// Records a logged-in session for apps a scripted username/password fill
// can't handle — OAuth, SSO, magic links, 2FA, anything with a UI flow too
// varied to automate reliably. Opens a real (headed) browser, a human logs
// in however the app requires, and once completion is detected, the
// resulting cookies/storage are saved to the auth profile's
// `storageStatePath` in docsolace.config.yaml — capture.mjs then reuses that
// file directly and never attempts a scripted login for that profile.
//
// Completion detection has two modes (see lib/auth-save.mjs): waiting for
// the browser to reach a known post-login URL (no stdin needed — works
// anywhere, including run from inside Claude Code's own Bash tool), or the
// original "press Enter when you're done" prompt, which only works with a
// real terminal attached. Run with neither available, this refuses up
// front instead of hanging forever on a prompt nothing can ever answer.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { decideCompletionMode } from './lib/auth-save.mjs';

const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // generous — real SSO/2FA logins take a while

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') args.profile = argv[i + 1];
    if (argv[i] === '--wait-for') args.waitFor = argv[i + 1];
  }
  if (!args.profile) {
    console.error('Usage: save-auth-state.mjs --profile <auth-profile-id> [--wait-for <url-pattern>]');
    process.exit(1);
  }
  return args;
}

function waitForEnter(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(promptText, () => { rl.close(); resolve(); }));
}

async function main() {
  const { profile: profileId, waitFor: waitForArg } = parseArgs(process.argv.slice(2));
  const config = loadConfig('docsolace.config.yaml');
  const profile = config.auth?.[profileId];
  if (!profile) {
    throw new Error(`Auth profile "${profileId}" not found in docsolace.config.yaml`);
  }
  if (!profile.storageStatePath) {
    throw new Error(
      `Auth profile "${profileId}" has no "storageStatePath" — add one before running this script; ` +
        `it's where the recorded session gets saved.`,
    );
  }

  // Fall back to the profile's own successUrlPattern (already meaningful
  // for scripted-login profiles) if --wait-for wasn't passed explicitly.
  const waitFor = waitForArg ?? profile.successUrlPattern;
  const mode = decideCompletionMode({ isTTY: process.stdin.isTTY === true, waitFor });

  if (mode === 'error-nontty') {
    throw new Error(
      `Can't wait for you to press Enter — this isn't running in an interactive terminal (for example, run ` +
        `from inside Claude Code's own Bash tool rather than your own shell). Run this exact command ` +
        `yourself in your own terminal instead (it opens a real, visible browser window), or pass ` +
        `--wait-for "<url-pattern>" (e.g. --wait-for "**/dashboard") so completion can be detected ` +
        `automatically once the browser navigates there, with no stdin needed.`,
    );
  }

  const viewport = Object.values(config.viewports)[0];
  const browser = await chromium.launch({ headless: false, args: config.launchArgs ?? [] });
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    await page.goto(`${config.baseUrl}${profile.loginUrl ?? '/'}`, { waitUntil: 'networkidle' });

    console.log('');
    console.log(`A browser window is open at ${config.baseUrl}${profile.loginUrl ?? '/'}.`);
    console.log('Log in however this app requires — OAuth, SSO, a magic link, 2FA, whatever.');

    if (mode === 'url-wait') {
      console.log(`Waiting for the browser to reach a URL matching "${waitFor}" (up to 5 minutes)...`);
      await page.waitForURL(waitFor, { timeout: DEFAULT_WAIT_TIMEOUT_MS });
      await page.waitForLoadState('networkidle');
    } else {
      console.log('Once you land on a signed-in page, come back here.');
      await waitForEnter('Press Enter to save this session... ');
    }

    fs.mkdirSync(path.dirname(profile.storageStatePath), { recursive: true });
    await context.storageState({ path: profile.storageStatePath });
  } finally {
    await browser.close();
  }

  console.log(`Saved to ${profile.storageStatePath}.`);
  console.log(`Tours using preconditions.auth: ${profileId} will reuse it — no scripted login attempted.`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
