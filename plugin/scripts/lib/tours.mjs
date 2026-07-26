import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

// Tour ids get interpolated into file paths (tours/<id>.yaml,
// docs/<id>.md, <outputDir>/prose/<id>.json, <outputDir>/screenshots/<id>/,
// ...) all over the pipeline. Tour YAML is untrusted input per CLAUDE.md, so
// both the requested id (CLI arg) and the id read back out of the YAML body
// must be constrained to a safe slug before anything joins them into a path
// — otherwise a value like "../../../etc/foo" escapes the intended directory.
// Exported so lib/config.mjs can hold docs.sections' tour-id references to
// this exact same bar, instead of a second regex that could quietly drift
// out of sync with it.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
        `from disk and used by the browser.`,
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

// A wait step's "state" mirrors Playwright's own Locator#waitFor states
// exactly — anything else can't be executed, so it's rejected at load time
// rather than surfacing as a Playwright error mid-capture.
const WAIT_STATES = ['visible', 'hidden', 'attached', 'detached'];

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
    // A step is either an action or a capture, never both — capture.mjs's
    // step-execution loop is a plain if/else if chain ending in `else if
    // (step.capture)`, so a step with both would either silently never
    // reach the capture branch (the action "wins", capture is dropped with
    // no error) or, if the action's own fields were malformed, let
    // `isCapture` alone (the only isX check that doesn't look at
    // step.action) mask that malformed step past every other check. Reject
    // this combination explicitly, with a clear reason, rather than let it
    // surface as a confusing runtime crash or a silently-missing screenshot.
    if (step.action !== undefined && step.capture !== undefined) {
      throw new Error(
        `Tour "${tourId}" step ${index} is invalid: has both an "action" and a "capture" field — a step ` +
          `is always one or the other, never both.`,
      );
    }
    const isGoto = step.action === 'goto' && typeof step.path === 'string';
    const isClick = step.action === 'click' && typeof step.selector === 'string';
    const isCapture = typeof step.capture === 'string' && step.action === undefined;
    const isUpload =
      step.action === 'upload' && typeof step.selector === 'string' && typeof step.file === 'string';
    // These five are all typed values handed straight to a Playwright
    // Locator method — unlike upload's "file", none of them get joined
    // into a filesystem path, so a typeof check is the right and
    // sufficient bar here (same as click's existing selector check).
    const isFill = step.action === 'fill' && typeof step.selector === 'string' && typeof step.value === 'string';
    const isType = step.action === 'type' && typeof step.selector === 'string' && typeof step.value === 'string';
    const isSelect =
      step.action === 'select' && typeof step.selector === 'string' && typeof step.value === 'string';
    const isCheck =
      step.action === 'check' &&
      typeof step.selector === 'string' &&
      (step.checked === undefined || typeof step.checked === 'boolean');
    const isPress = step.action === 'press' && typeof step.selector === 'string' && typeof step.key === 'string';
    const isHover = step.action === 'hover' && typeof step.selector === 'string';
    const isWait =
      step.action === 'wait' && typeof step.selector === 'string' && WAIT_STATES.includes(step.state);
    if (
      !isGoto &&
      !isClick &&
      !isCapture &&
      !isUpload &&
      !isFill &&
      !isType &&
      !isSelect &&
      !isCheck &&
      !isPress &&
      !isHover &&
      !isWait
    ) {
      throw new Error(
        `Tour "${tourId}" step ${index} is invalid: expected a goto/click/upload/fill/type/select/check/` +
          `press/hover/wait action or a capture`,
      );
    }
    // capture.mjs and generate-docs.mjs both join this straight into
    // filesystem paths (screenshot/a11y/docs-image files) — same untrusted-
    // YAML trust boundary as tour.id above, so it needs the same guard.
    if (isCapture) {
      assertSafeSlug(step.capture, `Tour "${tourId}" step ${index}'s "capture" field`);
    }
    // Optional, capture-step-only — the element capture.mjs outlines with a
    // deterministic CSS highlight before shooting that step's screenshot
    // (see capture.mjs's per-viewport highlight application). Doesn't make
    // sense on an action step (goto/click/etc. produce no screenshot), so
    // it's rejected there the same way an action+capture combination
    // already is above — a typo'd highlight on the wrong step type would
    // otherwise be silently ignored instead of caught here at load time.
    if (step.highlight !== undefined) {
      if (!isCapture) {
        throw new Error(
          `Tour "${tourId}" step ${index} is invalid: "highlight" is only valid on a capture step, not an ` +
            `action step.`,
        );
      }
      if (typeof step.highlight !== 'string' || !step.highlight.trim()) {
        throw new Error(`Tour "${tourId}" step ${index}'s "highlight" field must be a non-empty string.`);
      }
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

  // preconditions.voice is a fixture path read into the browser at launch
  // time (see capture.mjs's fake-microphone wiring) — same trust boundary
  // as an upload step's "file", so it gets the same guard. !== undefined
  // (not truthy) so an explicit empty string still gets validated —
  // assertSafeFixturePath rejects it anyway (it doesn't start with
  // "fixtures/"), but the point is to never silently skip the check just
  // because the value happens to be falsy.
  if (tour.preconditions?.voice !== undefined) {
    assertSafeFixturePath(tour.preconditions.voice, `Tour "${tourId}"'s "preconditions.voice" field`);
  }

  return tour;
}
