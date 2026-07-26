// package.json's description/keywords were empty for a while (the drift
// this project already got caught on once for plugin.json's version — see
// CLAUDE.md's plugin-packaging section, and plugin-files.test.mjs). A blank
// description also shows up verbatim in npm/GitHub search results, so this
// guards against it going quietly empty again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

describe('root package.json metadata', () => {
  it('has a non-empty description', () => {
    expect(typeof pkg.description).toBe('string');
    expect(pkg.description.trim().length).toBeGreaterThan(0);
  });

  it('has at least one keyword', () => {
    expect(Array.isArray(pkg.keywords)).toBe(true);
    expect(pkg.keywords.length).toBeGreaterThan(0);
    for (const keyword of pkg.keywords) {
      expect(typeof keyword).toBe('string');
      expect(keyword.trim().length).toBeGreaterThan(0);
    }
  });
});
