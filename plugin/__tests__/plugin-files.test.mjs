import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseToolList } from '../../scripts/lib/frontmatter.mjs';

const pluginRoot = path.join(import.meta.dirname, '..');

describe('plugin.json', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'),
  );

  it('has a kebab-case name and a description', () => {
    expect(manifest.name).toBe('autodocs');
    expect(manifest.description?.length).toBeGreaterThan(0);
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

  it('only pre-approves the three npm scripts it needs, no bare Bash', () => {
    const tools = parseToolList(frontmatter['allowed-tools']);
    expect(tools).toEqual([
      'Bash(npm run capture *)',
      'Bash(npm run drift *)',
      'Bash(npm run generate-docs *)',
    ]);
  });

  it('delegates prose generation to the doc-scribe subagent, not itself', () => {
    expect(body).toContain('doc-scribe');
    expect(body.toLowerCase()).toContain('never hand-write');
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
