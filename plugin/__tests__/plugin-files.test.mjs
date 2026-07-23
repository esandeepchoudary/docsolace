import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseToolList } from '../scripts/lib/frontmatter.mjs';

const pluginRoot = path.join(import.meta.dirname, '..');

describe('plugin.json', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'),
  );

  it('has a kebab-case name and a description', () => {
    expect(manifest.name).toBe('autodocs');
    expect(manifest.description?.length).toBeGreaterThan(0);
  });

  it('has an explicit semver version, so updates require bumping it', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('package.json (bundled runtime deps)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));

  it('lists the runtime deps the bundled scripts actually import', () => {
    for (const dep of ['playwright', 'js-yaml', 'pixelmatch', 'pngjs', 'glob']) {
      expect(pkg.dependencies).toHaveProperty(dep);
    }
  });

  it('has no devDependencies — this manifest only ever gets `npm install`ed, never developed against', () => {
    expect(pkg.devDependencies).toBeUndefined();
  });
});

describe('hooks/hooks.json', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks/hooks.json'), 'utf8'));
  const command = hooks.hooks.SessionStart[0].hooks[0].command;

  it('installs bundled deps into CLAUDE_PLUGIN_DATA, never CLAUDE_PLUGIN_ROOT', () => {
    expect(command).toContain('${CLAUDE_PLUGIN_DATA}');
    expect(command).toContain('npm install');
  });

  it('copies scripts into the data dir so they sit next to node_modules (ESM needs a sibling, not NODE_PATH)', () => {
    expect(command).toContain('cp -r "${CLAUDE_PLUGIN_ROOT}/scripts" "${CLAUDE_PLUGIN_DATA}/scripts"');
  });

  it('only reinstalls when the bundled manifest actually changed (diff-gated)', () => {
    expect(command).toContain('diff -q');
    expect(command).toContain('package.json');
  });

  it('also installs the Playwright browser the capture runner needs', () => {
    expect(command).toContain('playwright install chromium');
  });
});

describe('.mcp.json (bundled, project-scoped)', () => {
  const mcp = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  it('declares the playwright server tour-scout depends on', () => {
    expect(mcp.mcpServers).toHaveProperty('playwright');
  });
});

describe('.claude-plugin/marketplace.json (repo root)', () => {
  const marketplaceRoot = path.join(pluginRoot, '..');
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(marketplaceRoot, '.claude-plugin/marketplace.json'), 'utf8'),
  );

  it('has the required name/owner/plugins fields and a description', () => {
    expect(marketplace.name?.length).toBeGreaterThan(0);
    expect(marketplace.description?.length).toBeGreaterThan(0);
    expect(marketplace.owner?.name?.length).toBeGreaterThan(0);
    expect(Array.isArray(marketplace.plugins)).toBe(true);
  });

  it('lists the plugin with a relative source pointing at ./plugin', () => {
    const entry = marketplace.plugins.find((p) => p.name === 'autodocs');
    expect(entry).toBeTruthy();
    expect(entry.source).toBe('./plugin');
  });
});

describe('skills/document/SKILL.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'skills/document/SKILL.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "document" and documents its tour-id argument', () => {
    expect(frontmatter.name).toBe('document');
    expect(frontmatter['argument-hint']).toBeTruthy();
    expect(body).toContain('$ARGUMENTS');
  });

  it('only pre-approves scoped git commands, no bare Bash', () => {
    // capture/drift/generate-docs run via node "${CLAUDE_PLUGIN_DATA}/scripts/*.mjs"
    // — not pre-approved here because CLAUDE_PLUGIN_DATA isn't substituted in
    // allowed-tools (only CLAUDE_SKILL_DIR/CLAUDE_PROJECT_DIR are), so a
    // wildcard pattern would either never match or be too broad. They prompt
    // for permission on first use instead, which is safe.
    const tools = parseToolList(frontmatter['allowed-tools']);
    expect(tools).toEqual(['Bash(git diff *)', 'Bash(git log *)']);
    expect(tools.every((t) => t.startsWith('Bash('))).toBe(true);
  });

  it('bootstraps autodocs.config.yaml/tours in a project on first use', () => {
    expect(body).toContain('autodocs.config.yaml');
    expect(body.toLowerCase()).toContain('bootstrap');
    expect(body).toContain('tours/');
  });

  it("invokes bundled scripts from the plugin's data directory, not via npm run", () => {
    expect(body).toContain('${CLAUDE_PLUGIN_DATA}/scripts/');
    expect(body).not.toMatch(/npm run \w/);
  });

  it('delegates prose generation to the doc-scribe subagent, not itself', () => {
    expect(body).toContain('doc-scribe');
    expect(body.toLowerCase()).toContain('never hand-write');
  });

  it('delegates tour drafting to the tour-scout subagent, and never auto-confirms', () => {
    expect(body).toContain('tour-scout');
    expect(body).toContain('draft the tour yourself');
    expect(body).toContain('status');
    expect(body).toContain('confirmed');
  });
});

describe('agents/doc-scribe.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'agents/doc-scribe.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "doc-scribe" with a description and a model set', () => {
    expect(frontmatter.name).toBe('doc-scribe');
    expect(frontmatter.description?.length).toBeGreaterThan(0);
    expect(frontmatter.model).toBeTruthy();
  });

  it('has a bounded maxTurns', () => {
    expect(typeof frontmatter.maxTurns).toBe('number');
    expect(frontmatter.maxTurns).toBeGreaterThan(0);
    expect(frontmatter.maxTurns).toBeLessThanOrEqual(30);
  });

  it('is restricted to exactly Read and Write — no Bash, Edit, or web access', () => {
    const tools = parseToolList(frontmatter.tools);
    expect(tools.sort()).toEqual(['Read', 'Write']);
  });

  it('does not declare mcpServers, hooks, or permissionMode (unsupported for plugin agents)', () => {
    expect(frontmatter.mcpServers).toBeUndefined();
    expect(frontmatter.hooks).toBeUndefined();
    expect(frontmatter.permissionMode).toBeUndefined();
  });

  it("instructs grounding strictly in the a11y snapshot and never inventing UI", () => {
    expect(body.toLowerCase()).toContain('never describe');
    expect(body).toContain('a11y');
  });
});

describe('agents/tour-scout.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'agents/tour-scout.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "tour-scout" with a description and a model set', () => {
    expect(frontmatter.name).toBe('tour-scout');
    expect(frontmatter.description?.length).toBeGreaterThan(0);
    expect(frontmatter.model).toBeTruthy();
  });

  it('has a bounded maxTurns', () => {
    expect(typeof frontmatter.maxTurns).toBe('number');
    expect(frontmatter.maxTurns).toBeGreaterThan(0);
    expect(frontmatter.maxTurns).toBeLessThanOrEqual(30);
  });

  it('has no Bash access — only Read, Write, and Playwright MCP tools', () => {
    const tools = parseToolList(frontmatter.tools);
    expect(tools).not.toContain('Bash');
    expect(tools).toContain('Read');
    expect(tools).toContain('Write');
    expect(tools.some((t) => t.startsWith('mcp__playwright'))).toBe(true);
  });

  it('does not declare mcpServers, hooks, or permissionMode (unsupported for plugin agents)', () => {
    expect(frontmatter.mcpServers).toBeUndefined();
    expect(frontmatter.hooks).toBeUndefined();
    expect(frontmatter.permissionMode).toBeUndefined();
  });

  it('never sets status: confirmed itself — that is a human decision', () => {
    expect(body).toContain('never set `status: confirmed`');
  });

  it('instructs grounding every step in what it actually observed, never guessing selectors', () => {
    expect(body.toLowerCase()).toContain('ground every step');
    expect(body.toLowerCase()).toContain('rather than guessing');
  });
});
