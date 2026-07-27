// Verifies every relative markdown link/anchor across the repo's top-level
// docs (README.md + the companion pages it links out to) actually resolves.
// These files are read directly on GitHub, not built by anything, so nothing
// else catches a dead link here — a Docusaurus build only checks `docs/`.
//
// This guards the README split done for SEO/discoverability: content that
// used to be "see X above/below" within one file now crosses file
// boundaries as real relative links, which is easy to get wrong by hand.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const DOC_FILES = [
  'README.md',
  'CONFIGURATION.md',
  'PUBLISHING.md',
  'TROUBLESHOOTING.md',
  'ADVANCED.md',
  'CONTRIBUTING.md',
];

// GitHub's heading-to-anchor slugger: lowercase, strip characters that
// aren't a letter/number/space/hyphen/underscore, then turn spaces into
// hyphens. Duplicate slugs on the same page get -1, -2, ... appended, in
// order of appearance.
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/\s+/g, '-');
}

function extractHeadingSlugs(text) {
  const seen = new Map();
  const slugs = new Set();
  const headingRe = /^#{1,6}\s+(.+)$/gm;
  let match;
  while ((match = headingRe.exec(text))) {
    const base = slugify(match[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

// [text](target) — ignore image embeds (![alt](src)), checked separately
// below by extractImages.
const LINK_RE = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;

function extractLinks(text) {
  const links = [];
  let match;
  while ((match = LINK_RE.exec(text))) {
    links.push(match[1]);
  }
  return links;
}

// ![alt](src) — e.g. the README's social-preview banner.
const IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

function extractImages(text) {
  const images = [];
  let match;
  while ((match = IMAGE_RE.exec(text))) {
    images.push(match[1]);
  }
  return images;
}

const fileCache = new Map();
function readDoc(relPath) {
  if (!fileCache.has(relPath)) {
    const abs = path.join(repoRoot, relPath);
    fileCache.set(relPath, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
  }
  return fileCache.get(relPath);
}

describe('top-level docs cross-links', () => {
  for (const docFile of DOC_FILES) {
    it(`every relative link in ${docFile} resolves`, () => {
      const text = readDoc(docFile);
      expect(text, `${docFile} should exist`).not.toBeNull();

      const links = extractLinks(text).filter(
        (target) => !/^(https?:|mailto:)/i.test(target)
      );

      const problems = [];
      for (const target of links) {
        const [rawPath, anchor] = target.split('#');
        const targetPath = rawPath === '' ? docFile : path.posix.normalize(
          path.posix.join(path.posix.dirname(docFile), rawPath)
        );

        if (rawPath !== '') {
          const abs = path.join(repoRoot, targetPath);
          if (!fs.existsSync(abs)) {
            problems.push(`dead path: ${target} (resolved to ${targetPath})`);
            continue;
          }
        }

        if (anchor) {
          const targetText = rawPath === '' ? text : readDoc(targetPath);
          if (targetText == null) continue; // already reported above
          const slugs = extractHeadingSlugs(targetText);
          if (!slugs.has(anchor)) {
            problems.push(
              `dead anchor: ${target} (#${anchor} not found in ${targetPath})`
            );
          }
        }
      }

      expect(problems, problems.join('\n')).toEqual([]);
    });

    it(`every image embed in ${docFile} resolves`, () => {
      const text = readDoc(docFile);
      expect(text, `${docFile} should exist`).not.toBeNull();

      const images = extractImages(text).filter((target) => !/^https?:/i.test(target));

      const problems = [];
      for (const target of images) {
        const targetPath = path.posix.normalize(path.posix.join(path.posix.dirname(docFile), target));
        const abs = path.join(repoRoot, targetPath);
        if (!fs.existsSync(abs)) {
          problems.push(`dead image: ${target} (resolved to ${targetPath})`);
        }
      }

      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});
