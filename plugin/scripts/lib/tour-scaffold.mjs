// Renders a draft tour YAML for a proposed (not yet human-reviewed) tour.
// Used by the tour-scout subagent (see plugin/agents/tour-scout.md) after it
// explores the app via Playwright MCP — never invents a step; every step it
// passes in must be grounded in something it actually observed.
export function renderDraftTour({ id, title, intent, codePaths, steps, auth }) {
  const stepsYaml = steps
    .map((step) => {
      if (step.action) {
        const lines = [`  - action: ${step.action}`];
        if (step.path) lines.push(`    path: ${step.path}`);
        if (step.selector) lines.push(`    selector: "${step.selector}"`);
        return lines.join('\n');
      }
      return [`  - capture: ${step.capture}`, `    description: "${step.description}"`].join('\n');
    })
    .join('\n');

  const codePathsYaml = codePaths.map((p) => `  - ${p}`).join('\n');

  // Only include a preconditions.auth block when tour-scout is confident
  // (it couldn't reach the route without an existing auth profile's login
  // flow) — otherwise leave the TODO for a human to fill in, since seed
  // fixtures and less obvious auth needs aren't reliably inferable from one
  // exploration pass.
  const preconditions = auth
    ? `preconditions:\n  auth: ${auth}  # tour-scout needed this profile's login flow to reach the route below\n`
    : `# TODO: add preconditions (auth/seed) here if this flow requires being signed\n` +
      `# in — see the auth/seeds entries in autodocs.config.yaml.\n`;

  return `id: ${id}
title: "${title}"
intent: "${intent}"
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
