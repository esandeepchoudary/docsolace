// Decides how scripts/save-auth-state.mjs detects "the human is done
// logging in" — the one part of the OAuth/SSO recording flow that used to
// unconditionally wait on stdin (a `readline` "press Enter" prompt), which
// hangs forever with no way out when stdin isn't a real terminal (e.g. run
// from inside Claude Code's own Bash tool rather than the user's own
// terminal).
//
// Three outcomes:
// - 'url-wait': a URL pattern is available (an explicit --wait-for, or the
//   auth profile's own successUrlPattern) — wait for the headed browser to
//   navigate there on its own. Needs no stdin interaction at all.
// - 'enter': no URL pattern, but stdin is a real TTY — fall back to the
//   original "press Enter when you're done" prompt.
// - 'error-nontty': no URL pattern AND stdin isn't a TTY — waiting for
//   Enter would hang forever with nothing able to satisfy it. Refuse
//   up front instead of hanging.
export function decideCompletionMode({ isTTY, waitFor }) {
  if (waitFor) return 'url-wait';
  if (isTTY) return 'enter';
  return 'error-nontty';
}
