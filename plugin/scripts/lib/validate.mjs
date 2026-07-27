// Preflight checks for a project's docsolace.config.yaml + tours/*.yaml.
// loadTour (lib/tours.mjs) already enforces structural correctness (safe
// slugs, a non-empty steps array, site-relative goto paths) at load time —
// this module catches the class of problem that currently only surfaces
// *during* a run: capture.mjs's ensureAuthState throwing after it's already
// launched a browser because a tour names an auth profile that doesn't
// exist, or a code_paths glob that silently matches nothing so the drift
// gate can never fire from a code change. Running this first turns those
// into a single fast report instead of a mid-capture failure.
import fs from 'node:fs';
import path from 'node:path';
import { resolveCodePathFiles } from './drift.mjs';
import { isPublishedTour } from './product.mjs';
import { mergeMasks } from './masking.mjs';

const LOCATOR_PREFIXES = ['role=', 'text='];

function isLocatorStyle(selector) {
  return typeof selector === 'string' && LOCATOR_PREFIXES.some((prefix) => selector.startsWith(prefix));
}

// Validates one already-loaded tour (see lib/tours.mjs's loadTour) against
// an already-loaded config. Returns a list of {level, tour, message}
// findings — 'error' means capture/generate would fail or silently misbehave,
// 'warn' means it'll work but deviates from a stated convention.
//
// `allTours` (optional — every tour under tours/, loaded the same way this
// one was) is what lets the prerequisites/see_also cross-link check below
// tell "names a real tour" apart from "names nothing" — lib/tours.mjs's own
// load-time check can only confirm each entry is a *safe slug*, not that a
// sibling tour by that name actually exists. Omitted, that one check is
// skipped rather than treated as a failure — every other check here still
// runs on just this one tour, same as before this field existed.
export function validateTour(config, tour, { cwd = process.cwd(), allTours } = {}) {
  const findings = [];
  const push = (level, message) => findings.push({ level, tour: tour.id, message });

  // An archived tour never runs again (capture.mjs/generate-docs.mjs/
  // drift.mjs all skip it) — validating its auth profile, code_paths, or
  // selectors would just be noise, and code_paths matching zero files is
  // *expected* for one (that's typically why it got archived), not a real
  // finding to report.
  if (tour.status === 'archived') return findings;

  const authProfileId = tour.preconditions?.auth;
  if (authProfileId) {
    const profile = config.auth?.[authProfileId];
    if (!profile) {
      push(
        'error',
        `preconditions.auth "${authProfileId}" has no matching entry under config.auth — capture would ` +
          `fail on this exact error, but only after already launching a browser.`,
      );
    } else if (profile.storageStatePath && !fs.existsSync(profile.storageStatePath)) {
      push(
        'warn',
        `auth profile "${authProfileId}" uses storageStatePath "${profile.storageStatePath}", which doesn't ` +
          `exist yet — record a session first (see the README's "If your app doesn't use a plain ` +
          `username/password login").`,
      );
    }
  }

  if (tour.preconditions?.voice && !fs.existsSync(path.join(cwd, tour.preconditions.voice))) {
    push(
      'error',
      `preconditions.voice fixture "${tour.preconditions.voice}" does not exist — capture would fail on ` +
        `this exact error, but only after already launching a browser.`,
    );
  }

  if (Array.isArray(tour.code_paths) && tour.code_paths.length > 0) {
    const matched = resolveCodePathFiles(tour.code_paths, cwd);
    if (matched.length === 0) {
      push(
        'warn',
        `code_paths matched no files — the drift gate can never mark this tour dirty from a code change, ` +
          `only from a screenshot change.`,
      );
    }
  }

  if (allTours) {
    for (const field of ['prerequisites', 'see_also']) {
      for (const targetId of tour[field] ?? []) {
        if (targetId === tour.id) {
          push('warn', `"${field}" lists this tour itself ("${targetId}") — remove the self-reference.`);
          continue;
        }
        const target = allTours.find((t) => t.id === targetId);
        if (!target) {
          push(
            'error',
            `"${field}" names tour "${targetId}", which doesn't exist under tours/ — generate-docs.mjs would ` +
              `render a dead link.`,
          );
        } else if (!isPublishedTour(target)) {
          push(
            'warn',
            `"${field}" names tour "${targetId}", which exists but isn't published yet (draft/proposed/` +
              `archived) — the link would point at a page that doesn't exist until it is.`,
          );
        }
      }
    }
  }

  for (const [index, step] of tour.steps.entries()) {
    // Applies to every selector-bearing step except `upload`: a real
    // <input type="file"> has no meaningful accessible role for this
    // purpose, so CSS (e.g. "input[type='file']") is the correct,
    // documented choice there — see CLAUDE.md's selector convention ("CSS
    // only as a fallback for things with no meaningful role"). Every other
    // step (click, fill, type, select, check, press, hover, wait) targets
    // an element that generally does have a meaningful role, so the warning
    // stays general rather than enumerating action names one by one — keeps
    // it correct automatically for any future selector-bearing step too.
    if (step.selector && step.action !== 'upload' && !isLocatorStyle(step.selector)) {
      push(
        'warn',
        `step ${index}: selector "${step.selector}" isn't a role=/text= locator — prefer accessibility ` +
          `locators over CSS, which is far more flaky.`,
      );
    }
    if (step.action === 'upload' && !fs.existsSync(path.join(cwd, step.file))) {
      push(
        'error',
        `step ${index}: upload fixture "${step.file}" does not exist — capture would fail on this exact ` +
          `error, but only after already launching a browser.`,
      );
    }
    if (step.highlight) {
      // Same convention nudge selectors get above — a highlight target is
      // just as prone to CSS-selector flakiness as an interactive one.
      if (!isLocatorStyle(step.highlight)) {
        push(
          'warn',
          `step ${index}: highlight "${step.highlight}" isn't a role=/text= locator — prefer accessibility ` +
            `locators over CSS, which is far more flaky.`,
        );
      }
      // Playwright's mask option paints a solid box over the masked
      // region's bounding box in the final screenshot, on top of whatever
      // was rendered underneath — including a highlight outline on the
      // same element. A literal-selector match here catches the obvious
      // "masked the exact thing I'm trying to highlight" mistake; it isn't
      // a full geometric overlap check (two different selectors that
      // happen to cover overlapping regions wouldn't be caught), just the
      // cheap, common case.
      if (mergeMasks(config.defaultMask, step.mask).includes(step.highlight)) {
        push(
          'warn',
          `step ${index}: highlight "${step.highlight}" is also in this capture's mask list — the mask ` +
            `paints over it in the final screenshot, hiding the highlight.`,
        );
      }
    }
  }

  return findings;
}

// Convenience for callers that just want one flat list across every tour
// (e.g. a test asserting on total counts); the CLI validates tour-by-tour
// so it can print a per-tour report.
export function validateProject(config, tours, { cwd = process.cwd() } = {}) {
  return tours.flatMap((tour) => validateTour(config, tour, { cwd, allTours: tours }));
}

// Preflight checks for the product-documentation layer (see lib/product.mjs)
// — all `warn`, never `error`: a thin/missing grounding source means the
// generated pages will be thin, not that generation will fail the way an
// undefined auth profile does for a tour. `tour: '_product'` reuses the same
// {level, tour, message} finding shape validateTour produces, tagged with
// the same reserved key generate-product-docs.mjs's state entry uses (see
// lib/product.mjs's PRODUCT_STATE_KEY), so a caller can print/filter it
// identically to a real tour's findings.
export function validateProduct(config, tours, { cwd = process.cwd() } = {}) {
  const findings = [];
  const push = (message) => findings.push({ level: 'warn', tour: '_product', message });

  if (!fs.existsSync(path.join(cwd, 'README.md'))) {
    push('No README.md found — the generated overview/getting-started pages will have little to ground in.');
  }

  for (const pattern of config.product?.sources ?? []) {
    if (resolveCodePathFiles([pattern], cwd).length === 0) {
      push(`product.sources entry "${pattern}" matched no files.`);
    }
  }

  const sections = config.docs?.sections;
  if (Array.isArray(sections) && sections.length > 0) {
    const tourIds = new Set(tours.map((t) => t.id));
    const sectionedIds = new Set();
    for (const section of sections) {
      for (const tourId of section.tours ?? []) {
        sectionedIds.add(tourId);
        if (!tourIds.has(tourId)) {
          push(`docs.sections "${section.label}" names tour "${tourId}", which doesn't exist under tours/.`);
        }
      }
    }
    for (const tour of tours.filter(isPublishedTour)) {
      if (!sectionedIds.has(tour.id)) {
        push(`tour "${tour.id}" is confirmed but appears in no docs.sections group — it'll be listed under "everything else".`);
      }
    }
  }

  return findings;
}
