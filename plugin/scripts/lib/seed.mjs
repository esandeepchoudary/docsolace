// Resolves what capture.mjs should do for a tour's preconditions.seed
// before running its steps. A seed is a named fixture declared in
// autodocs.config.yaml's `seeds` map, optionally backed by a `command` that
// (re)seeds the app's data before capture.
//
// A tour only ever *names* a seed id — per CLAUDE.md, tour YAML is
// untrusted input, so the command that actually runs lives in config only.
// But config is exactly as reachable by an unreviewed change as a tour is
// (both are project files a PR could touch), so a defined command still
// only ever runs when explicitly enabled via `allowSeedCommands` — default
// off, so a freshly cloned project never executes a command on its first
// capture just because a seed happens to declare one. No-command seeds
// (today's only real-world case — see this repo's own `demo-baseline`)
// remain valid no-ops regardless of the flag.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function resolveSeed(config, seedId, { allowSeedCommands = false } = {}) {
  if (typeof seedId !== 'string' || !SLUG_RE.test(seedId)) {
    return {
      action: 'error',
      message: `Seed id "${seedId}" is invalid — must be a lowercase kebab-case slug (letters, digits, ` +
        `hyphens only).`,
    };
  }

  const seed = config.seeds?.[seedId];
  if (!seed) {
    return {
      action: 'error',
      message: `preconditions.seed "${seedId}" has no matching entry under config.seeds.`,
    };
  }

  if (!seed.command) {
    return { action: 'noop', message: `Seed "${seedId}" has no command — nothing to run.` };
  }

  if (!allowSeedCommands) {
    return {
      action: 'skipped-disabled',
      command: seed.command,
      message:
        `Seed "${seedId}" declares a command but allowSeedCommands is off — skipping it, capturing ` +
        `against whatever data is already there. Set "allowSeedCommands: true" in autodocs.config.yaml, ` +
        `or pass --allow-seed-commands, to actually run it.`,
    };
  }

  return { action: 'run', command: seed.command, message: `Running seed "${seedId}"'s command: ${seed.command}` };
}
