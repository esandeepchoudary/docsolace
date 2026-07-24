import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

// Tour ids get interpolated into file paths (tours/<id>.yaml,
// docs/<id>.md, <outputDir>/prose/<id>.json, <outputDir>/screenshots/<id>/,
// ...) all over the pipeline. Tour YAML is untrusted input per CLAUDE.md, so
// both the requested id (CLI arg) and the id read back out of the YAML body
// must be constrained to a safe slug before anything joins them into a path
// — otherwise a value like "../../../etc/foo" escapes the intended directory.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSafeSlug(id, label) {
  if (typeof id !== 'string' || !SLUG_RE.test(id)) {
    throw new Error(
      `${label} "${id}" is invalid — must be a lowercase kebab-case slug (letters, digits, hyphens ` +
        `only, no leading/trailing hyphen), since it's used to build file paths.`,
    );
  }
}

// An upload step's "file" is read straight off disk and handed to
// Playwright's setInputFiles — same untrusted-YAML trust boundary as the
// slugs above. Constrained to a fixtures/ prefix (fixture files are
// project-committed, per CLAUDE.md's tour conventions) with every path
// segment required to start/end alphanumeric — this blocks "." and ".."
// segments (which start with a dot) while still allowing normal filenames
// like "sample.pcap" or "nested-dir/file_name.json".
const FIXTURE_PREFIX = 'fixtures/';
const FIXTURE_SEGMENT_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function assertSafeFixturePath(filePath, label) {
  if (typeof filePath !== 'string' || !filePath.startsWith(FIXTURE_PREFIX)) {
    throw new Error(
      `${label} "${filePath}" is invalid — must be a path starting with "fixtures/", since it's read ` +
        `from disk and uploaded into the browser.`,
    );
  }
  const segments = filePath.slice(FIXTURE_PREFIX.length).split('/');
  if (segments.length === 0 || segments.some((s) => !FIXTURE_SEGMENT_RE.test(s))) {
    throw new Error(
      `${label} "${filePath}" is invalid — each path segment after "fixtures/" must be letters/digits/` +
        `dots/hyphens/underscores only, no "." or ".." segments.`,
    );
  }
}

export function loadTour(toursDir, tourId) {
  assertSafeSlug(tourId, 'Tour id');
  const filePath = path.join(toursDir, `${tourId}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Tour "${tourId}" not found at ${filePath}`);
  }

  const tour = parseYaml(fs.readFileSync(filePath, 'utf8'));

  if (!tour || typeof tour !== 'object') {
    throw new Error(`Tour "${tourId}" is empty or not a valid YAML object`);
  }
  if (!tour.id) {
    throw new Error(`Tour "${tourId}" is missing required "id" field`);
  }
  assertSafeSlug(tour.id, `Tour "${tourId}"'s "id" field`);
  if (!Array.isArray(tour.steps) || tour.steps.length === 0) {
    throw new Error(`Tour "${tourId}" is missing required non-empty "steps" array`);
  }
  for (const [index, step] of tour.steps.entries()) {
    const isGoto = step.action === 'goto' && typeof step.path === 'string';
    const isClick = step.action === 'click' && typeof step.selector === 'string';
    const isCapture = typeof step.capture === 'string';
    const isUpload =
      step.action === 'upload' && typeof step.selector === 'string' && typeof step.file === 'string';
    if (!isGoto && !isClick && !isCapture && !isUpload) {
      throw new Error(
        `Tour "${tourId}" step ${index} is invalid: expected a goto/click/upload action or a capture`,
      );
    }
    // capture.mjs and generate-docs.mjs both join this straight into
    // filesystem paths (screenshot/a11y/docs-image files) — same untrusted-
    // YAML trust boundary as tour.id above, so it needs the same guard.
    if (isCapture) {
      assertSafeSlug(step.capture, `Tour "${tourId}" step ${index}'s "capture" field`);
    }
    // goto targets are appended directly to config.baseUrl — must be
    // site-relative ("/foo"), never an absolute or protocol-relative URL
    // ("https://evil.example", "//evil.example"), or a tour step could
    // navigate an authenticated session off-site and screenshot it.
    if (isGoto && !/^\/(?!\/)/.test(step.path)) {
      throw new Error(
        `Tour "${tourId}" step ${index}: goto path "${step.path}" must be a site-relative path starting ` +
          `with a single "/" — it's appended to config.baseUrl, so an absolute or protocol-relative URL ` +
          `would navigate off-site.`,
      );
    }
    if (isUpload) {
      assertSafeFixturePath(step.file, `Tour "${tourId}" step ${index}'s "file" field`);
    }
  }

  return tour;
}
