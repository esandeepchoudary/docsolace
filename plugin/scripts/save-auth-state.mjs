// Records a logged-in session for apps a scripted username/password fill
// can't handle — OAuth, SSO, magic links, 2FA, anything with a UI flow too
// varied to automate reliably. Opens a real (headed) browser, a human logs
// in however the app requires, and once they confirm, the resulting
// cookies/storage are saved to the auth profile's `storageStatePath` in
// autodocs.config.yaml — capture.mjs then reuses that file directly and
// never attempts a scripted login for that profile.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') args.profile = argv[i + 1];
  }
  if (!args.profile) {
    console.error('Usage: save-auth-state.mjs --profile <auth-profile-id>');
    process.exit(1);
  }
  return args;
}

function waitForEnter(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(promptText, () => { rl.close(); resolve(); }));
}

const { profile: profileId } = parseArgs(process.argv.slice(2));
const config = loadConfig('autodocs.config.yaml');
const profile = config.auth?.[profileId];
if (!profile) {
  throw new Error(`Auth profile "${profileId}" not found in autodocs.config.yaml`);
}
if (!profile.storageStatePath) {
  throw new Error(
    `Auth profile "${profileId}" has no "storageStatePath" — add one before running this script; ` +
      `it's where the recorded session gets saved.`,
  );
}

const viewport = Object.values(config.viewports)[0];
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport });
const page = await context.newPage();

await page.goto(`${config.baseUrl}${profile.loginUrl ?? '/'}`, { waitUntil: 'networkidle' });

console.log('');
console.log(`A browser window is open at ${config.baseUrl}${profile.loginUrl ?? '/'}.`);
console.log('Log in however this app requires — OAuth, SSO, a magic link, 2FA, whatever.');
console.log('Once you land on a signed-in page, come back here.');
await waitForEnter('Press Enter to save this session... ');

fs.mkdirSync(path.dirname(profile.storageStatePath), { recursive: true });
await context.storageState({ path: profile.storageStatePath });
await browser.close();

console.log(`Saved to ${profile.storageStatePath}.`);
console.log(`Tours using preconditions.auth: ${profileId} will reuse it — no scripted login attempted.`);
