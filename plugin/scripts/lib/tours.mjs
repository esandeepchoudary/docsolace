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
    if (!isGoto && !isClick && !isCapture) {
      throw new Error(
        `Tour "${tourId}" step ${index} is invalid: expected a goto/click action or a capture`,
      );
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
  }

  return tour;
}
