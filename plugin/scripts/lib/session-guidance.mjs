// Builds the standing guidance injected into every session via the
// SessionStart hook (see hooks/hooks.json and scripts/session-guidance.mjs).
//
// This ports this project's own "Tutorial-need check" convention (previously
// only written down in DocSolace's own CLAUDE.md, so it never reached a
// project that merely installs the plugin) so it travels with the plugin
// itself. It is deliberately *soft* guidance, not an automated trigger: the
// brief (§8 Phase 7) explicitly rejects a git hook that heuristically
// guesses "a feature just landed" and auto-drafts a tour. This function
// instead gives Claude standing instructions to notice the moment and ask
// the human — the human still decides whether to run `/document propose`,
// and still has to flip `status: confirmed` themselves.
//
// Uses only node:fs/node:path — no YAML parsing — because all it needs to
// know is whether the project has been initiated at all.
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILENAME = 'docsolace.config.yaml';

const NOT_INITIATED_GUIDANCE = `DocSolace is installed in this project but hasn't been set up yet (no \
docsolace.config.yaml). Run \`/document\` to bootstrap it — it will ask for the app's base URL and \
scaffold a starter config and empty tours/ directory. Nothing else below applies until then.`;

const INITIATED_GUIDANCE = `DocSolace is installed and set up in this project. When you finish \
implementing a user-facing feature or flow, before wrapping up, evaluate whether it's worth a \
tutorial and surface that to the user — don't silently decide either way.

- If it's a new feature not covered by any existing tour: suggest running \
\`/document propose <slug> "<description>"\`. This dispatches the tour-scout subagent, which drives \
the real app and drafts tours/<slug>.yaml grounded in what it actually finds — then, by default, \
carries the draft through validation, auto-confirmation, capture, generation, and an opened docs PR \
in the same invocation (never auto-merged). Append \`--review\` to stop after the draft instead and \
flip \`status: confirmed\` yourself once you've reviewed it.
- If it changes a flow an existing confirmed tour already covers: suggest running \
\`/document <slug>\` to resync that tour's screenshots and prose and ship the result as a PR.
- This still isn't fully automatic — a run always stops and asks at a hard stop (tour-scout \
couldn't ground the feature, an unverified voice flow, a validate.mjs error, an unrecorded auth \
session, or a hand-edited page it won't silently overwrite), and it never merges the PR it opens; \
merging \`main\` stays the human's call.`;

export function buildSessionGuidance(projectDir) {
  const configPath = path.join(projectDir, CONFIG_FILENAME);
  return fs.existsSync(configPath) ? INITIATED_GUIDANCE : NOT_INITIATED_GUIDANCE;
}
