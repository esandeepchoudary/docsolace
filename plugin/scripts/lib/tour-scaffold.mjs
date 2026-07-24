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
export function renderDraftTour({ id, title, intent, codePaths, steps, auth }) {
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

  // Only include a preconditions.auth block when tour-scout is confident
  // (it couldn't reach the route without an existing auth profile's login
  // flow) — otherwise leave the TODO for a human to fill in, since seed
  // fixtures and less obvious auth needs aren't reliably inferable from one
  // exploration pass.
  const preconditions = auth
    ? `preconditions:\n  auth: ${yamlString(auth)}  # tour-scout needed this profile's login flow to reach the route below\n`
    : `# TODO: add preconditions (auth/seed) here if this flow requires being signed\n` +
      `# in — see the auth/seeds entries in autodocs.config.yaml.\n`;

  return `id: ${yamlString(id)}
title: ${yamlString(title)}
intent: ${yamlString(intent)}
maturity: draft
# Drafted by tour-scout, not yet reviewed — the drift gate and /document both
# skip proposed tours entirely (see CLAUDE.md's "Tour and doc-generation
# conventions"). Review the steps/selectors below, fill in preconditions and
# mask if this flow needs them, then flip status to confirmed.
status: proposed
${preconditions}steps:
${stepsYaml}
code_paths:
${codePathsYaml}
`;
}
