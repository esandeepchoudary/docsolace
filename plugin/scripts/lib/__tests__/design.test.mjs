import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeRenderHash, discoverDesignSkills, loadDocStyle } from '../design.mjs';

const tmpDirs = [];
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function makeTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeSkill(root, relDir, { name, description }) {
  const dir = path.join(root, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\nBody.\n`,
  );
}

describe('discoverDesignSkills', () => {
  it('returns an empty list when neither project nor home has any skills', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    const homeDir = makeTmpDir('autodocs-design-test-home-');
    expect(discoverDesignSkills({ projectDir, homeDir })).toEqual([]);
  });

  it('finds a project-level design skill under .claude/skills', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    writeSkill(projectDir, '.claude/skills/mirai-brand', {
      name: 'mirai-brand',
      description: 'Full brand styling rules: colors, fonts, logo, and visual identity.',
    });
    const candidates = discoverDesignSkills({ projectDir, homeDir: undefined });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ name: 'mirai-brand', scope: 'project' });
  });

  it('finds a project-level design skill nested under an installed plugin', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    writeSkill(projectDir, '.claude/plugins/cache/some-marketplace/brand-plugin/1.0.0/skills/brand-kit', {
      name: 'brand-kit',
      description: 'Design system tokens: color palette and typography.',
    });
    const candidates = discoverDesignSkills({ projectDir, homeDir: undefined });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('brand-kit');
  });

  it('scores out a skill whose name/description has no design-relevant keywords', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    writeSkill(projectDir, '.claude/skills/deploy-helper', {
      name: 'deploy-helper',
      description: 'Deploys the app to production and runs smoke tests.',
    });
    expect(discoverDesignSkills({ projectDir, homeDir: undefined })).toEqual([]);
  });

  it('ranks a project-scoped candidate above a user-scoped one regardless of keyword score', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    const homeDir = makeTmpDir('autodocs-design-test-home-');
    writeSkill(projectDir, '.claude/skills/project-brand', {
      name: 'project-brand',
      description: 'brand',
    });
    writeSkill(homeDir, '.claude/skills/user-brand', {
      name: 'user-brand',
      description:
        'brand design system style guide visual identity color palette typography logo ui kit theme',
    });
    const candidates = discoverDesignSkills({ projectDir, homeDir });
    expect(candidates.map((c) => c.name)).toEqual(['project-brand', 'user-brand']);
    expect(candidates[0].scope).toBe('project');
    expect(candidates[1].scope).toBe('user');
  });

  it('does not throw when projectDir/homeDir do not exist', () => {
    expect(discoverDesignSkills({ projectDir: '/nonexistent/path', homeDir: '/also/nonexistent' })).toEqual([]);
  });
});

describe('loadDocStyle', () => {
  it('returns {} when .autodocs/doc-style.json does not exist', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    expect(loadDocStyle(projectDir)).toEqual({});
  });

  it('loads a valid style file', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({
        skill: 'mirai-brand',
        page: { stepsHeading: 'Walkthrough', viewportLabels: { mobile: 'On your phone' }, figures: true },
      }),
    );
    expect(loadDocStyle(projectDir)).toEqual({
      skill: 'mirai-brand',
      page: { stepsHeading: 'Walkthrough', viewportLabels: { mobile: 'On your phone' }, figures: true },
    });
  });

  it('throws on invalid JSON', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.autodocs', 'doc-style.json'), '{not json');
    expect(() => loadDocStyle(projectDir)).toThrow(/not valid JSON/);
  });

  it('rejects a stepsHeading containing markdown/HTML metacharacters', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({ page: { stepsHeading: '<script>alert(1)</script>' } }),
    );
    expect(() => loadDocStyle(projectDir)).toThrow(/metacharacters/);
  });

  it('rejects an over-long label', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({ page: { stepsHeading: 'x'.repeat(61) } }),
    );
    expect(() => loadDocStyle(projectDir)).toThrow(/60 characters or fewer/);
  });

  it('rejects a viewportLabels key that is not lowercase-kebab', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({ page: { viewportLabels: { 'Not_Valid!': 'x' } } }),
    );
    expect(() => loadDocStyle(projectDir)).toThrow(/lowercase letters, digits, and hyphens/);
  });

  it('rejects a newline embedded in a label', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({ page: { stepsHeading: 'line one\nline two' } }),
    );
    expect(() => loadDocStyle(projectDir)).toThrow(/metacharacters/);
  });

  it('rejects page.figures when not a boolean', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({ page: { figures: 'yes' } }),
    );
    expect(() => loadDocStyle(projectDir)).toThrow(/"page.figures" must be a boolean/);
  });

  it('never surfaces the "site" section', () => {
    const projectDir = makeTmpDir('autodocs-design-test-');
    fs.mkdirSync(path.join(projectDir, '.autodocs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.autodocs', 'doc-style.json'),
      JSON.stringify({ skill: 'mirai-brand', site: { primaryColor: '#EB315F' } }),
    );
    expect(loadDocStyle(projectDir).site).toBeUndefined();
  });
});

describe('computeRenderHash', () => {
  it('is stable for equal input', () => {
    const input = { templateVersion: 2, docsConfig: { primaryViewport: 'desktop' }, pageStyle: { stepsHeading: 'Steps' } };
    expect(computeRenderHash(input)).toBe(computeRenderHash({ ...input }));
  });

  it('changes when the template version changes', () => {
    const a = computeRenderHash({ templateVersion: 1, docsConfig: {}, pageStyle: {} });
    const b = computeRenderHash({ templateVersion: 2, docsConfig: {}, pageStyle: {} });
    expect(a).not.toBe(b);
  });

  it('changes when docsConfig changes', () => {
    const a = computeRenderHash({ templateVersion: 1, docsConfig: { primaryViewport: 'desktop' }, pageStyle: {} });
    const b = computeRenderHash({ templateVersion: 1, docsConfig: { primaryViewport: 'mobile' }, pageStyle: {} });
    expect(a).not.toBe(b);
  });

  it('changes when pageStyle changes', () => {
    const a = computeRenderHash({ templateVersion: 1, docsConfig: {}, pageStyle: { stepsHeading: 'Steps' } });
    const b = computeRenderHash({ templateVersion: 1, docsConfig: {}, pageStyle: { stepsHeading: 'Walkthrough' } });
    expect(a).not.toBe(b);
  });
});
