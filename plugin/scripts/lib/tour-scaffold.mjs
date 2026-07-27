// A JSON string is a valid YAML flow scalar, so JSON.stringify sidesteps
// YAML-injection/syntax-breakage from a value containing a `"`, `:`,
// newline, etc. without needing a bespoke YAML-escaping routine — same
// technique lib/bootstrap.mjs's safeYamlBaseUrl uses, for the same reason.
// Needed here because every string this module interpolates (selectors,
// descriptions, title/intent) is either tour-scout's own free-text summary
// or copied straight from a live accessibility snapshot — e.g. the
// role-locator style lib/validate.mjs itself recommends,
// `role=button[name="Save"]`, contains a `"` and would otherwise break the
// naive `"${value}"` interpolation this replaced.
function yamlString(value) {
  return JSON.stringify(value);
}

// Renders a draft tour YAML for a proposed (not yet human-reviewed) tour.
// Used by the tour-scout subagent (see plugin/agents/tour-scout.md) after it
// explores the app via Playwright MCP — never invents a step; every step it
// passes in must be grounded in something it actually observed.
export function renderDraftTour({ id, title, intent, codePaths, steps, auth, voice, suggestedPrerequisite }) {
  const stepsYaml = steps
    .map((step) => {
      if (step.action) {
        const lines = [`  - action: ${step.action}`];
        if (step.path) lines.push(`    path: ${yamlString(step.path)}`);
        if (step.selector) lines.push(`    selector: ${yamlString(step.selector)}`);
        if (step.file) lines.push(`    file: ${yamlString(step.file)}`);
        // !== undefined (not truthy) so an intentionally empty-string fill
        // value, or an explicit checked: false, still renders instead of
        // being silently dropped.
        if (step.value !== undefined) lines.push(`    value: ${yamlString(step.value)}`);
        if (step.checked !== undefined) lines.push(`    checked: ${yamlString(step.checked)}`);
        if (step.key) lines.push(`    key: ${yamlString(step.key)}`);
        if (step.state) lines.push(`    state: ${yamlString(step.state)}`);
        return lines.join('\n');
      }
      return [`  - capture: ${yamlString(step.capture)}`, `    description: ${yamlString(step.description)}`].join(
        '\n',
      );
    })
    .join('\n');

  const codePathsYaml = codePaths.map((p) => `  - ${yamlString(p)}`).join('\n');

  // Only include a preconditions.auth/voice line when tour-scout is
  // confident about it (couldn't reach the route without an existing auth
  // profile's login flow; the flow genuinely needed a given voice fixture)
  // — otherwise leave the TODO for a human to fill in, since seed fixtures
  // and less obvious preconditions aren't reliably inferable from one
  // exploration pass. auth and voice can both apply to the same tour (e.g.
  // a signed-in voice feature), so build the block from whichever are
  // present rather than treating them as mutually exclusive.
  const preconditionLines = [];
  if (auth) {
    preconditionLines.push(
      `  auth: ${yamlString(auth)}  # tour-scout needed this profile's login flow to reach the route below`,
    );
  }
  if (voice) {
    preconditionLines.push(`  voice: ${yamlString(voice)}  # fixture audio fed as the fake microphone input`);
  }
  const preconditions =
    preconditionLines.length > 0
      ? `preconditions:\n${preconditionLines.join('\n')}\n`
      : `# TODO: add preconditions (auth/seed/voice) here if this flow requires being signed\n` +
        `# in or needs microphone input — see the auth/seeds entries in docsolace.config.yaml.\n`;

  // Suggested, never live — same "suggest, don't auto-fill" discipline as
  // preconditions/mask above. Only ever set alongside `auth` (see tour-
  // scout.md: it's the tour, among the ones it was given, that tour-scout
  // found actually documents *this same* auth profile's own login flow) —
  // a human reviews and uncomments it (or picks a different one) rather
  // than tour-scout guessing which existing tour is "the login tour" and
  // wiring up a live cross-link that might be wrong.
  const prerequisitesSuggestion = suggestedPrerequisite
    ? `# prerequisites:\n#   - ${yamlString(suggestedPrerequisite)}  # suggested: this tour looked like it covers ` +
      `${auth ? `"${auth}"'s` : "this flow's"} own login flow — review and uncomment if right\n`
    : '';

  return `id: ${yamlString(id)}
title: ${yamlString(title)}
intent: ${yamlString(intent)}
maturity: draft
# Drafted by tour-scout, not yet reviewed — the drift gate and /document both
# skip proposed tours entirely (see CLAUDE.md's "Tour and doc-generation
# conventions"). By default, /document propose and /document map carry this
# straight through validation, confirmation (flipping status/maturity below),
# capture, and generation once tour-scout finishes — review the
# steps/selectors and any synthetic values it flagged in its report. Run
# /document propose|map with --review instead if you'd rather review and
# flip status to confirmed yourself before anything else runs.
status: proposed
${preconditions}${prerequisitesSuggestion}steps:
${stepsYaml}
code_paths:
${codePathsYaml}
`;
}
