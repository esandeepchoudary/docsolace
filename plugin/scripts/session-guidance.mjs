// SessionStart hook entry point (see hooks/hooks.json). Prints the
// hookSpecificOutput JSON Claude Code expects, with additionalContext set to
// the standing "suggest documentation" guidance from lib/session-guidance.mjs.
//
// Runs from ${CLAUDE_PLUGIN_ROOT} (not ${CLAUDE_PLUGIN_DATA}) deliberately:
// unlike the rest of scripts/, this one imports no third-party dependency,
// so it has no ordering dependency on the other SessionStart hook's
// `npm install` finishing first.
import { buildSessionGuidance } from './lib/session-guidance.mjs';

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const additionalContext = buildSessionGuidance(projectDir);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    }),
  );
}

main();
