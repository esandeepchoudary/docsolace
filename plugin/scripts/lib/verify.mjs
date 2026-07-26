// Post-generation, pre-PR checks over the whole docs/ tree: do the image
// references generate-docs.mjs just wrote actually resolve on disk, do
// internal markdown links resolve (to a real page, and — if they carry a
// "#anchor" — to a real heading on it), and is anything under docs/images/
// left behind with nothing pointing at it. None of this needs a browser or a
// subagent; it's plain text/filesystem checking over content the pipeline
// already produced, run as the last gate before a docs PR opens (see
// verify-docs.mjs and SKILL.md's Steps section).
//
// Findings share lib/validate.mjs's {level, tour, message} shape so a caller
// can print/filter them identically. `tour` here is the page's basename
// (without the .md extension) relative to docsDir — 'login',
// 'archive/dashboard-export', etc. — not a validated tour id, just a label.
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
// Negative lookbehind excludes the "!" that makes the same syntax an image
// link instead — otherwise every image reference would double-count as a
// broken/valid link too.
const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING_RE = /^#{1,6}\s+(.+?)\s*#*$/gm;
const CODE_FENCE_RE = /^```.*$/gm;
const EXTERNAL_TARGET_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

// Strips fenced code blocks before scanning for image/link syntax — a
// product page's own example YAML/markdown snippet quoting `![...]()` or
// `[...]()` as documentation isn't a real reference to check.
function stripCodeFences(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (CODE_FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    out.push(inFence ? '' : line);
  }
  return out.join('\n');
}

function isExternalTarget(target) {
  return EXTERNAL_TARGET_RE.test(target) || target.startsWith('mailto:');
}

// Mirrors the heading-anchor algorithm Docusaurus/GitHub use closely enough
// for this purpose: lowercase, strip anything that isn't a letter/digit/
// space/hyphen, collapse whitespace to single hyphens. Doesn't handle
// duplicate-heading disambiguation ("-1" suffixes) — none of AutoDocs' own
// generated pages produce duplicate headings, so that's out of scope rather
// than silently wrong.
function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractHeadingSlugs(markdown) {
  const slugs = new Set();
  for (const match of markdown.matchAll(HEADING_RE)) {
    slugs.add(slugifyHeading(match[1]));
  }
  return slugs;
}

function relativeLabel(docsDir, filePath) {
  return path.relative(docsDir, filePath).replace(/\.md$/, '').split(path.sep).join('/');
}

function listDocPages(docsDir) {
  return globSync('**/*.md', { cwd: docsDir, nodir: true }).map((rel) => path.join(docsDir, rel));
}

// Every local image/link target this function finds referenced anywhere in
// docs/ — findOrphanImages needs this to tell "unreferenced" from
// "referenced but broken" (the latter is findBrokenImageRefs's job, not
// double-reported here as an orphan too).
function collectReferencedImagePaths(docsDir, pages) {
  const referenced = new Set();
  for (const filePath of pages) {
    const markdown = stripCodeFences(fs.readFileSync(filePath, 'utf8'));
    for (const match of markdown.matchAll(IMAGE_RE)) {
      const target = match[2].trim();
      if (isExternalTarget(target)) continue;
      const resolved = path.resolve(path.dirname(filePath), target);
      referenced.add(resolved);
    }
  }
  return referenced;
}

// Every `![alt](path)` in docs/**/*.md whose local target doesn't exist on
// disk. The single highest-value check here: archive-tour.mjs moves both a
// page and its images, and a wrong relative path in that move breaks
// silently (the site build still succeeds — Docusaurus doesn't fail on a
// missing image, it just renders a broken `<img>`).
export function findBrokenImageRefs(docsDir) {
  const findings = [];
  for (const filePath of listDocPages(docsDir)) {
    const markdown = stripCodeFences(fs.readFileSync(filePath, 'utf8'));
    const tour = relativeLabel(docsDir, filePath);
    for (const match of markdown.matchAll(IMAGE_RE)) {
      const target = match[2].trim();
      if (isExternalTarget(target)) continue;
      const resolved = path.resolve(path.dirname(filePath), target);
      if (!fs.existsSync(resolved)) {
        findings.push({
          level: 'error',
          tour,
          message: `image reference "${target}" does not resolve to a file on disk.`,
        });
      }
    }
  }
  return findings;
}

// Every relative `[text](path)` link whose target page doesn't exist, or
// whose "#anchor" doesn't match a real heading on the target (or, for a
// same-page "#anchor" link, on the current page). External links (http(s)://,
// mailto:, any other URL scheme, protocol-relative "//...") are skipped —
// out of scope for a filesystem check.
export function findBrokenInternalLinks(docsDir) {
  const findings = [];
  const pages = listDocPages(docsDir);
  const pagesByPath = new Map(pages.map((p) => [p, stripCodeFences(fs.readFileSync(p, 'utf8'))]));

  for (const [filePath, rawMarkdown] of pagesByPath) {
    const markdown = stripCodeFences(rawMarkdown);
    const tour = relativeLabel(docsDir, filePath);

    for (const match of markdown.matchAll(LINK_RE)) {
      const target = match[2].trim();
      if (isExternalTarget(target)) continue;

      const [rawPathPart, anchor] = target.split('#');
      const pathPart = rawPathPart.trim();

      let targetFile = filePath;
      if (pathPart) {
        let resolved = path.resolve(path.dirname(filePath), pathPart);
        if (!fs.existsSync(resolved) && fs.existsSync(`${resolved}.md`)) resolved = `${resolved}.md`;
        if (!fs.existsSync(resolved)) {
          findings.push({
            level: 'error',
            tour,
            message: `link "${target}" does not resolve to a file on disk.`,
          });
          continue;
        }
        targetFile = resolved;
      }

      if (anchor) {
        const targetMarkdown = pagesByPath.get(targetFile) ?? stripCodeFences(fs.readFileSync(targetFile, 'utf8'));
        const slugs = extractHeadingSlugs(targetMarkdown);
        if (!slugs.has(anchor)) {
          findings.push({
            level: 'error',
            tour,
            message: `link "${target}" points at anchor "#${anchor}", which doesn't match any heading on ` +
              `"${relativeLabel(docsDir, targetFile)}".`,
          });
        }
      }
    }
  }
  return findings;
}

// Image files under docs/**/images/** (or docs/archive/**/images/**) that no
// page references. `warn`, not `error` — an archive-in-progress or a
// leftover from a manual edit is untidy, not broken, and jumping straight to
// `error` here would make an in-flight multi-tour run noisy for no reason.
export function findOrphanImages(docsDir) {
  const pages = listDocPages(docsDir);
  const referenced = collectReferencedImagePaths(docsDir, pages);
  const imageFiles = globSync('**/*.{png,jpg,jpeg,gif,svg,webp}', { cwd: docsDir, nodir: true })
    .map((rel) => path.join(docsDir, rel));

  return imageFiles
    .filter((imagePath) => !referenced.has(path.resolve(imagePath)))
    .map((imagePath) => ({
      level: 'warn',
      tour: relativeLabel(docsDir, imagePath),
      message: `"${path.relative(docsDir, imagePath)}" isn't referenced by any page under ${docsDir}.`,
    }));
}

// Convenience for the CLI: all three checks, in the order most-actionable
// first (a missing image is a definite bug; an orphan image is just tidiness).
export function verifyDocs(docsDir) {
  return [...findBrokenImageRefs(docsDir), ...findBrokenInternalLinks(docsDir), ...findOrphanImages(docsDir)];
}
