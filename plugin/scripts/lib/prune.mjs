// Orphan-tour detection: the reverse of /document map's gap detection (which
// finds features with no tour). This finds tours whose feature no longer
// appears to exist in the app, so it can be archived instead of silently
// going stale or failing capture with a confusing error the next time it
// runs — see CLAUDE.md's "Tour and doc-generation conventions" and the
// README's "Archiving a removed feature".
//
// Two independent, purely mechanical signals — no framework-routing judgment
// call here (unlike /document map's own code-review step, which deliberately
// stays a prompt-driven human/Claude judgment call since routing conventions
// vary too much to parse reliably):
//
//   1. code-removed  — the tour's code_paths glob, which used to resolve to
//      at least one file (it was captured/generated successfully before),
//      now resolves to zero. The strongest signal: the source backing the
//      feature is gone.
//   2. route-unreachable — none of the tour's own `goto` step paths appear
//      anywhere in a freshly crawled site-map.json or a code-review-derived
//      source-routes.json. Only checked when at least one of those inputs is
//      supplied — a plain string-membership test against data /document
//      map's crawl/code-review steps already produced, not a fresh
//      exploration of its own.
//
// A tour flagged by either signal is an *orphan candidate*, not an automatic
// deletion — see archive-tour.mjs, which only ever archives (moves the page
// under docs/archive/, flips status), never deletes tour YAML or doc content.
import { resolveCodePathFiles } from './drift.mjs';

// Site-relative paths visited by this tour's `goto` steps, in step order.
// Pure data extraction — tours.mjs's loadTour already validated every goto
// path is site-relative before this ever sees it.
export function resolveTourRoutes(tour) {
  return (tour.steps ?? []).filter((step) => step.action === 'goto').map((step) => step.path);
}

// tours: array of already-loaded tour objects (lib/tours.mjs's loadTour).
// state: the parsed .docsolace/artifacts/state.json (lib/state.mjs's
//   loadState) — only a tour with a previous entry (successfully generated
//   at least once) can be an orphan; a tour that's simply never been
//   captured yet isn't "removed", it just hasn't run.
// siteMap: optional parsed .docsolace/artifacts/site-map.json `pages` array
//   (crawl.mjs's output) — when omitted, route-unreachable is never checked.
// sourceRoutes: optional array of site-relative route strings (/document
//   map's code-review step's source-routes.json) — same optionality.
export function findOrphanTours({ tours, state, siteMap, sourceRoutes, cwd = process.cwd() } = {}) {
  // Both come from JSON files a previous /document map run wrote (or a
  // caller-supplied path) — untrusted/possibly-stale on-disk input, same
  // trust boundary as tour YAML per CLAUDE.md. A malformed shape (e.g. a
  // hand-edited site-map.json whose "pages" isn't an array) should fail with
  // a clear, path-naming message, not a bare "siteMap.map is not a
  // function" TypeError — same posture lib/fs-atomic.mjs's readJsonFile
  // already takes for corrupt JSON generally.
  if (siteMap !== undefined && !Array.isArray(siteMap)) {
    throw new Error('findOrphanTours: siteMap must be an array of {route, ...} page entries (or omitted).');
  }
  if (sourceRoutes !== undefined && !Array.isArray(sourceRoutes)) {
    throw new Error('findOrphanTours: sourceRoutes must be an array of route strings (or omitted).');
  }

  const checkRoutes = siteMap !== undefined || sourceRoutes !== undefined;
  const knownRoutes = new Set([
    ...(siteMap ?? []).map((page) => page.route),
    ...(sourceRoutes ?? []),
  ]);

  const orphans = [];
  for (const tour of tours ?? []) {
    if (tour.maturity === 'draft' || tour.status === 'proposed' || tour.status === 'archived') continue;
    if (!state?.[tour.id]) continue; // never generated — nothing to have gone stale from

    const reasons = [];

    if (Array.isArray(tour.code_paths) && tour.code_paths.length > 0) {
      const matched = resolveCodePathFiles(tour.code_paths, cwd);
      if (matched.length === 0) reasons.push('code-removed');
    }

    if (checkRoutes) {
      const routes = resolveTourRoutes(tour);
      // .some(), not .every(): a multi-goto tour (e.g. a checkout flow that
      // visits /cart then /checkout) shouldn't need *every* one of its
      // routes missing before this fires — one unreached route is already
      // worth a human look. This is safe to be permissive about: unlike
      // code-removed, route-unreachable never triggers autonomous archiving
      // on its own (see isStrongOrphanSignal below) — it only ever surfaces
      // a candidate for review, so a false positive here costs a human one
      // extra glance, not a wrongly archived tour.
      if (routes.length > 0 && routes.some((route) => !knownRoutes.has(route))) {
        reasons.push('route-unreachable');
      }
    }

    if (reasons.length > 0) orphans.push({ tourId: tour.id, reasons });
  }
  return orphans;
}

// `code-removed` is checked against the committed git tree (computeCodePathsHash's
// own basis) — exact, not a sample. `route-unreachable` is checked against a
// crawl/code-review pass that's explicitly best-effort elsewhere in this
// codebase (bounded by maxPages/maxDepth, a profile can be skipped, a stale
// or partial site-map.json can simply be sitting on disk from an earlier,
// narrower run) — see crawl.mjs's own "a route can exist without being
// linked from anywhere any configured profile can reach" caveat. Treating an
// unreached route as proof of removal would risk archiving a live tour on
// nothing more than an incomplete crawl. Only `code-removed` is strong
// enough evidence to act on autonomously; a `route-unreachable`-only finding
// is still reported (see prune.mjs), just never auto-archived — same
// "surface it, don't act on weak evidence alone" posture as tour-scout's own
// "flagged in the report as unconfirmed reachability" for the gap-detection
// direction.
export function isStrongOrphanSignal(reasons) {
  return reasons.includes('code-removed');
}
