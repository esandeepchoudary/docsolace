// Targeted status edits for a tour's YAML source text — used by
// archive-tour.mjs the same way SKILL.md's "Propose a new tour" step already
// hand-edits a proposed→confirmed flip: a line-level replacement, not a full
// YAML parse/re-serialize, so tour-scaffold.mjs's explanatory comments and a
// human's own formatting/comments survive untouched.
const STATUS_LINE_RE = /^status:.*$/m;
const MATURITY_LINE_RE = /^maturity:.*$/m;

// Valid values for a tour's top-level `status` field — kept in one place so
// every caller (capture.mjs, drift.mjs, generate-docs.mjs, validate.mjs,
// archive-tour.mjs) agrees on the enum instead of each hardcoding its own
// string literals. `undefined`/omitted defaults to "confirmed" everywhere
// else in the codebase (see CLAUDE.md's tour conventions) — this list is
// only the values a tour may *explicitly* set.
export const TOUR_STATUSES = ['confirmed', 'proposed', 'archived'];

// Replaces (or, if absent, inserts) the top-level `status:` line in a tour's
// raw YAML text. Inserts right after `maturity:` when there isn't one yet —
// the same position tour-scaffold.mjs's renderDraftTour already places it at
// — so a tour written before `status` existed (implicit "confirmed") still
// ends up in a conventional spot rather than tacked onto the end of the file.
export function setTourStatus(yamlText, status) {
  if (!TOUR_STATUSES.includes(status)) {
    throw new Error(`setTourStatus: "${status}" is not a valid tour status (expected one of ${TOUR_STATUSES.join(', ')}).`);
  }
  if (STATUS_LINE_RE.test(yamlText)) {
    return yamlText.replace(STATUS_LINE_RE, `status: ${status}`);
  }
  if (MATURITY_LINE_RE.test(yamlText)) {
    return yamlText.replace(MATURITY_LINE_RE, (line) => `${line}\nstatus: ${status}`);
  }
  // No maturity line either (unusual, but not this function's job to
  // validate tour shape — loadTour does that) — append at the end rather
  // than silently doing nothing.
  const trimmed = yamlText.replace(/\n+$/, '');
  return `${trimmed}\nstatus: ${status}\n`;
}
