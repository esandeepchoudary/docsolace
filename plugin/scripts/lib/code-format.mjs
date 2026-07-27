// Deterministic safety net for one confirmed failure shape in
// product-scribe's generated prose: a run of bare, unfenced command lines
// (e.g. a sequence of Claude Code slash-commands or shell commands) that
// CommonMark collapses into one run-on paragraph on render, since adjacent
// non-blank lines with no blank line between them merge into a single
// paragraph — not just "missing syntax highlighting," an actually broken
// page. Confirmed real, not hypothetical: an early product-scribe run this
// project did wrap identifiers/commands correctly; a later one didn't,
// with nothing enforcing either way.
//
// This never invents or rewrites content — it only wraps lines that already
// look like commands in a fenced code block, so Docusaurus's already-
// configured Prism theme (site/docusaurus.config.js's `prism` block) can
// render/highlight them for free. The *general* fix is the hard-rule prompt
// guidance in agents/product-scribe.md/doc-scribe.md; this is backup for
// when that discipline slips, scoped to the one shape that actually breaks
// rendering (see lib/product.mjs's renderProductPage, the only caller).

// Command verbs whose *known* subcommands make a line recognizable as a real
// command rather than an ordinary sentence that happens to start with the
// same word (e.g. "git is also required." vs. "git status"). Deliberately a
// narrow, explicit whitelist — a false negative (an unwrapped command) is
// much safer than a false positive (mangling normal prose).
const VERB_SUBCOMMAND_PATTERNS = [
  /^npm\s+(?:install|run|test|ci|start|link|init)\b/,
  /^npx\s+\S+/,
  /^node\s+\S+/,
  /^git\s+(?:status|commit|push|pull|clone|diff|add|checkout|log|tag|init|remote|mv|rm)\b/,
  /^cd\s+\S+/,
  /^cp\s+\S+\s+\S+/,
  /^mv\s+\S+\s+\S+/,
  /^mkdir\s+(?:-p\s+)?\S+/,
  /^curl\s+\S+/,
  /^docker\s+\S+/,
  /^pip\s+install\s+\S+/,
];

// A Claude Code slash-command, e.g. "/plugin install foo@bar" or
// "/reload-plugins" on its own.
const SLASH_COMMAND_RE = /^\/[a-zA-Z][\w:-]*(?:\s.*)?$/;

// A trailing sentence/clause punctuation mark is the cheap, effective signal
// that a line is prose, not a command — a real command line essentially
// never ends in one of these.
const SENTENCE_END_RE = /[.?!:]$/;

function isSlashCommand(trimmed) {
  return SLASH_COMMAND_RE.test(trimmed);
}

function isKnownVerbCommand(trimmed) {
  return VERB_SUBCOMMAND_PATTERNS.some((re) => re.test(trimmed));
}

export function looksLikeCommandLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (SENTENCE_END_RE.test(trimmed)) return false;
  return isSlashCommand(trimmed) || isKnownVerbCommand(trimmed);
}

// Scans `body` line by line, skipping content already inside a ``` fence
// (never double-wraps or corrupts a block product-scribe already fenced
// correctly itself), and wraps every run of one or more consecutive
// command-like lines in a fenced code block — plain ``` (no language) if
// every line in the run is a Claude Code slash-command, ```bash otherwise.
// Adds a blank line on either side of the new fence when the surrounding
// text isn't already blank, since CommonMark needs that separation to parse
// a fence as a fence rather than as part of the preceding/following
// paragraph.
export function autoFenceCommandLines(body) {
  if (typeof body !== 'string' || body.length === 0) return body;

  const lines = body.split('\n');
  const output = [];
  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      i++;
      continue;
    }

    if (!inFence && looksLikeCommandLine(line)) {
      const run = [];
      while (i < lines.length && !/^\s*```/.test(lines[i]) && looksLikeCommandLine(lines[i])) {
        run.push(lines[i].trim());
        i++;
      }

      if (output.length > 0 && output[output.length - 1].trim() !== '') {
        output.push('');
      }

      const allSlash = run.every(isSlashCommand);
      output.push(allSlash ? '```' : '```bash');
      output.push(...run);
      output.push('```');

      if (i < lines.length && lines[i].trim() !== '') {
        output.push('');
      }

      continue;
    }

    output.push(line);
    i++;
  }

  return output.join('\n');
}
