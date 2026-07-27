// llms.txt (https://llmstxt.org/) is hand-written for this repo (a
// deliberate choice — see CONTRIBUTING.md's "Project layout" note), not
// mechanically generated the way docs/_sidebar.docsolace.json is. That means
// nothing regenerates it automatically when a tour or product page is
// added/renamed/removed — this test is the guard against it silently going
// stale instead: it fails CI the moment the real tour/page inventory and
// llms.txt (both copies — repo root and site/static/) disagree, so a human
// has to update the file rather than never noticing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { load as parseYaml } from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { isPublishedTour } from '../plugin/scripts/lib/product.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

function loadPublishedTourIds() {
  const files = glob.sync('tours/*.yaml', { cwd: repoRoot });
  return files
    .map((f) => parseYaml(fs.readFileSync(path.join(repoRoot, f), 'utf8')))
    .filter(isPublishedTour)
    .map((t) => t.id);
}

function loadProductPageIds() {
  const sidebarPath = path.join(repoRoot, 'docs', '_sidebar.docsolace.json');
  if (!fs.existsSync(sidebarPath)) return [];
  return JSON.parse(fs.readFileSync(sidebarPath, 'utf8')).productPages ?? [];
}

const LLMS_TXT_COPIES = ['llms.txt', 'site/static/llms.txt'];

describe('llms.txt stays in sync with the real tour/page inventory', () => {
  it('both copies exist', () => {
    for (const rel of LLMS_TXT_COPIES) {
      expect(fs.existsSync(path.join(repoRoot, rel)), `${rel} should exist`).toBe(true);
    }
  });

  it('the two copies are byte-identical', () => {
    const [a, b] = LLMS_TXT_COPIES.map((rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    expect(a).toBe(b);
  });

  for (const rel of LLMS_TXT_COPIES) {
    it(`${rel} mentions every currently published tour id`, () => {
      const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      const missing = loadPublishedTourIds().filter((id) => !text.includes(id));
      expect(missing, `missing tour id(s) in ${rel}: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${rel} mentions every enabled product page id`, () => {
      const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      const missing = loadProductPageIds().filter((id) => !text.includes(id));
      expect(missing, `missing product page id(s) in ${rel}: ${missing.join(', ')}`).toEqual([]);
    });
  }
});
