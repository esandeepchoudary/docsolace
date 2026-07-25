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
// state: the parsed .autodocs/artifacts/state.json (lib/state.mjs's
//   loadState) — only a tour with a previous entry (successfully generated
//   at least once) can be an orphan; a tour that's simply never been
//   captured yet isn't "removed", it just hasn't run.
// siteMap: optional parsed .autodocs/artifacts/site-map.json `pages` array
//   (crawl.mjs's output) — when omitted, route-unreachable is never checked.
// sourceRoutes: optional array of site-relative route strings (/document
//   map's code-review step's source-routes.json) — same optionality.
export function findOrphanTours({ tours, state, siteMap, sourceRoutes, cwd = process.cwd() } = {}) {
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
      if (routes.length > 0 && routes.every((route) => !knownRoutes.has(route))) {
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
