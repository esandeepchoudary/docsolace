import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findBrokenImageRefs, findBrokenInternalLinks, findOrphanImages, verifyDocs } from '../verify.mjs';

const tmpDirs = [];

function mkTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-verify-test-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('findBrokenImageRefs', () => {
  it('reports nothing when every image reference resolves', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'images/login/login-full@desktop.png', 'fake-png');
    writeFile(dir, 'login.md', '# Login\n\n1. **Sign in**\n\n   ![Sign in](images/login/login-full@desktop.png)\n');
    expect(findBrokenImageRefs(dir)).toEqual([]);
  });

  it('reports an error for an image target missing on disk', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'login.md', '![Sign in](images/login/missing.png)\n');
    const findings = findBrokenImageRefs(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'error', tour: 'login' });
    expect(findings[0].message).toMatch(/missing\.png/);
  });

  it('skips external image URLs', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'login.md', '![External](https://example.com/logo.png)\n');
    expect(findBrokenImageRefs(dir)).toEqual([]);
  });

  it('checks archived pages under docs/archive/', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'archive/old-feature.md', '![Old](images/old-feature/missing.png)\n');
    const findings = findBrokenImageRefs(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0].tour).toBe('archive/old-feature');
  });

  it('ignores image syntax inside fenced code blocks', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'concepts.md', ['# Concepts', '', '```markdown', '![example](does/not/exist.png)', '```', ''].join('\n'));
    expect(findBrokenImageRefs(dir)).toEqual([]);
  });
});

describe('findBrokenInternalLinks', () => {
  it('reports nothing for a link that resolves, with or without a .md extension', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'login.md', '# Login\n');
    writeFile(dir, 'dashboard.md', '[Log in first](login.md)\n\n[Log in again](login)\n');
    expect(findBrokenInternalLinks(dir)).toEqual([]);
  });

  it('reports an error for a link whose target file does not exist', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'dashboard.md', '[Missing](nowhere.md)\n');
    const findings = findBrokenInternalLinks(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'error', tour: 'dashboard' });
  });

  it('resolves a same-page anchor against that page\'s own headings', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'concepts.md', '# Concepts\n\n## Tours\n\nSee [Tours](#tours) above.\n');
    expect(findBrokenInternalLinks(dir)).toEqual([]);
  });

  it('reports an error for an anchor that matches no heading on the target page', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'concepts.md', '# Concepts\n\n## Tours\n');
    writeFile(dir, 'overview.md', 'See [Tours](concepts.md#nonexistent)\n');
    const findings = findBrokenInternalLinks(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/#nonexistent/);
  });

  it('skips external links', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'login.md', '[Anthropic](https://www.anthropic.com)\n[Email us](mailto:a@example.com)\n');
    expect(findBrokenInternalLinks(dir)).toEqual([]);
  });

  it('does not treat an image reference as a link', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'images/login/full.png', 'fake-png');
    writeFile(dir, 'login.md', '![Sign in](images/login/full.png)\n');
    expect(findBrokenInternalLinks(dir)).toEqual([]);
  });
});

describe('findOrphanImages', () => {
  it('reports a warn for an image nothing references', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'images/login/full.png', 'fake-png');
    writeFile(dir, 'login.md', '# Login\n');
    const findings = findOrphanImages(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'warn' });
    expect(findings[0].message).toMatch(/full\.png/);
  });

  it('reports nothing when every image is referenced', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'images/login/full.png', 'fake-png');
    writeFile(dir, 'login.md', '![Sign in](images/login/full.png)\n');
    expect(findOrphanImages(dir)).toEqual([]);
  });
});

describe('verifyDocs', () => {
  it('combines all three checks', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'images/login/orphan.png', 'fake-png');
    writeFile(dir, 'login.md', ['![Sign in](images/login/missing.png)', '[Dashboard](dashboard.md)'].join('\n'));
    const findings = verifyDocs(dir);
    const levels = findings.map((f) => f.level).sort();
    expect(levels).toEqual(['error', 'error', 'warn']);
  });
});
