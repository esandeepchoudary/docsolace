// Builds the standing guidance injected into every session via the
// SessionStart hook (see hooks/hooks.json and scripts/session-guidance.mjs).
//
// This ports this project's own "Tutorial-need check" convention so it
// travels with the plugin. It is deliberately *soft* guidance, not an
// automated trigger: the brief (§8 Phase 7) explicitly rejects a git hook that
// heuristically guesses "a feature just landed" and auto-drafts a tour. This
// only tells Claude to leave a single reminder line when UI files changed; the
// human decides whether to run `/document`.
//
// Uses only node:fs/node:path — no YAML parsing — because all it needs to
// know is whether the project has been initiated at all.
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILENAME = 'docsolace.config.yaml';

const NOT_INITIATED_GUIDANCE = `DocSolace is installed in this project but hasn't been set up yet (no \
docsolace.config.yaml). Run \`/document\` to bootstrap it — it will ask for the app's base URL and \
scaffold a starter config and empty tours/ directory. Nothing else below applies until then.`;

// Deliberately tiny: one trigger, one line of output, no mode names. A bare
// `/document` already works out resync-vs-new-tutorial on its own (see
// scripts/triage.mjs), so the session guidance never needs to teach modes,
// slugs, or the --review flag.
const INITIATED_GUIDANCE = `DocSolace is set up in this project. Only if you changed user-facing UI \
files (components, pages, styles) this session, end your final reply with exactly one line: \
"Tutorials may be out of date — run /document to update them." Don't ask questions about it, don't \
explain modes, and stay completely silent otherwise (backend-only, tests, config, docs).`;

export function buildSessionGuidance(projectDir) {
  const configPath = path.join(projectDir, CONFIG_FILENAME);
  return fs.existsSync(configPath) ? INITIATED_GUIDANCE : NOT_INITIATED_GUIDANCE;
}
