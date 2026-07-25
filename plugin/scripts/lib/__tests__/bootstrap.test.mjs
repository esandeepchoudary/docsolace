import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureGitignoreEntries, renderAnnotatedConfig } from '../bootstrap.mjs';
import { loadConfig } from '../config.mjs';

const tmpFiles = [];

function writeTmpYaml(contents) {
  const filePath = path.join(os.tmpdir(), `autodocs-bootstrap-test-${Date.now()}-${Math.random()}.yaml`);
  fs.writeFileSync(filePath, contents);
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  while (tmpFiles.length) fs.rmSync(tmpFiles.pop(), { force: true });
});

describe('renderAnnotatedConfig', () => {
  it('produces a config that loadConfig can parse immediately, no uncommenting needed', () => {
    const yaml = renderAnnotatedConfig('http://localhost:5173');
    const filePath = writeTmpYaml(yaml);
    const config = loadConfig(filePath);

    expect(config.baseUrl).toBe('http://localhost:5173');
    expect(config.outputDir).toBe('.autodocs/artifacts');
    expect(config.viewports.desktop).toEqual({ width: 1280, height: 800 });
    expect(config.viewports.mobile).toEqual({ width: 390, height: 844 });
    // Everything optional stays commented out, so it's absent, not invalid.
    expect(config.auth).toBeUndefined();
    expect(config.defaultMask).toBeUndefined();
    expect(config.docs).toBeUndefined();
  });

  it('includes commented example stanzas for both auth shapes, masks, seeds, and docs layout', () => {
    const yaml = renderAnnotatedConfig('http://localhost:3000');
    expect(yaml).toContain('# auth:');
    expect(yaml).toContain('storageStatePath: .autodocs/artifacts/.auth/oauth-user.manual.json');
    expect(yaml).toContain('usernameEnv: AUTODOCS_STANDARD_USER_USERNAME');
    expect(yaml).toContain('# defaultMask:');
    expect(yaml).toContain('# seeds:');
    expect(yaml).toContain('# allowSeedCommands: false');
    expect(yaml).toContain('# docs:');
    expect(yaml).toContain('#   primaryViewport: desktop');
    expect(yaml).toContain('#   collapseOtherViewports: true');
  });

  it('normalizes and safely quotes the baseUrl', () => {
    const yaml = renderAnnotatedConfig('http://localhost:3000/');
    expect(yaml).toContain('baseUrl: "http://localhost:3000"');
  });

  it('rejects a non-URL baseUrl instead of embedding it', () => {
    expect(() => renderAnnotatedConfig('not-a-url')).toThrow(/valid URL/);
  });

  it('rejects a non-http(s) protocol', () => {
    expect(() => renderAnnotatedConfig('ftp://example.com')).toThrow(/http:\/\/ or https:\/\//);
  });

  it('rejects an empty baseUrl', () => {
    expect(() => renderAnnotatedConfig('')).toThrow(/required/);
  });

  it('neutralizes an attempted YAML-injection baseUrl rather than splicing it in raw', () => {
    // A baseUrl crafted to break out of the scalar and inject a new key.
    // Whatever the URL parser makes of this, the output must stay a single
    // JSON-quoted scalar on the baseUrl line — never an unquoted multi-line
    // value that could introduce a sibling YAML key.
    const malicious = 'http://x\nauth:\n  evil: true';
    let yaml;
    try {
      yaml = renderAnnotatedConfig(malicious);
    } catch (err) {
      // Rejecting it outright is an acceptable, safe outcome too.
      expect(err.message).toMatch(/valid URL/);
      return;
    }
    const baseUrlLine = yaml.split('\n').find((line) => line.startsWith('baseUrl:'));
    expect(baseUrlLine).toMatch(/^baseUrl: "/);
    expect(baseUrlLine).not.toContain('\nauth:');
  });
});

describe('ensureGitignoreEntries', () => {
  it('adds a header and the entries to an empty file', () => {
    const result = ensureGitignoreEntries('', ['.autodocs/artifacts/', '.env']);
    expect(result).toBe('# AutoDocs (added automatically by /autodocs:document)\n.autodocs/artifacts/\n.env\n');
  });

  it('appends after existing content, separated by a blank line', () => {
    const result = ensureGitignoreEntries('node_modules/\n', ['.env']);
    expect(result).toBe(
      'node_modules/\n\n# AutoDocs (added automatically by /autodocs:document)\n.env\n',
    );
  });

  it('is idempotent — a second call with the same entries changes nothing', () => {
    const first = ensureGitignoreEntries('node_modules/\n', ['.autodocs/artifacts/', '.env']);
    const second = ensureGitignoreEntries(first, ['.autodocs/artifacts/', '.env']);
    expect(second).toBe(first);
  });

  it('only adds entries that are actually missing, without duplicating the header', () => {
    const withEnvAlready = 'node_modules/\n.env\n';
    const result = ensureGitignoreEntries(withEnvAlready, ['.autodocs/artifacts/', '.env']);
    expect(result).toBe('node_modules/\n.env\n\n# AutoDocs (added automatically by /autodocs:document)\n.autodocs/artifacts/\n');
    // Only one header line even though this is effectively a second pass.
    expect(result.match(/# AutoDocs/g)).toHaveLength(1);
  });

  it('does nothing when every entry is already present', () => {
    const already = '# AutoDocs (added automatically by /autodocs:document)\n.autodocs/artifacts/\n.env\n';
    expect(ensureGitignoreEntries(already, ['.autodocs/artifacts/', '.env'])).toBe(already);
  });

  it("includes .playwright-mcp/ — init-project.mjs's real GITIGNORE_ENTRIES list", () => {
    // Mirrors the literal entry set in plugin/scripts/init-project.mjs
    // (not imported directly — that module runs its CLI main() on import).
    // tour-scout's Playwright MCP driving drops a .playwright-mcp/ scratch
    // dir (page snapshots, console logs) into the project root the first
    // time /document propose runs; a freshly bootstrapped project must
    // gitignore it, same as .autodocs/artifacts/ and .env, or it can get
    // committed by accident.
    const realEntries = ['.autodocs/artifacts/', '.env', '.playwright-mcp/'];
    const result = ensureGitignoreEntries('', realEntries);
    expect(result).toContain('.playwright-mcp/');
    for (const entry of realEntries) {
      expect(result).toContain(entry);
    }
  });
});
