// Preflight checks for a project's autodocs.config.yaml + tours/*.yaml.
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

const LOCATOR_PREFIXES = ['role=', 'text='];

function isLocatorStyle(selector) {
  return typeof selector === 'string' && LOCATOR_PREFIXES.some((prefix) => selector.startsWith(prefix));
}

// Validates one already-loaded tour (see lib/tours.mjs's loadTour) against
// an already-loaded config. Returns a list of {level, tour, message}
// findings — 'error' means capture/generate would fail or silently misbehave,
// 'warn' means it'll work but deviates from a stated convention.
export function validateTour(config, tour, { cwd = process.cwd() } = {}) {
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
  }

  return findings;
}

// Convenience for callers that just want one flat list across every tour
// (e.g. a test asserting on total counts); the CLI validates tour-by-tour
// so it can print a per-tour report.
export function validateProject(config, tours, { cwd = process.cwd() } = {}) {
  return tours.flatMap((tour) => validateTour(config, tour, { cwd }));
}
