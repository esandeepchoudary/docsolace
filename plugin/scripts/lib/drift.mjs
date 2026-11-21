import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync } from 'glob';

export function resolveCodePathFiles(codePaths, cwd = process.cwd()) {
  const files = new Set();
  for (const pattern of codePaths ?? []) {
    for (const file of globSync(pattern, { cwd, nodir: true })) {
      files.add(file);
    }
  }
  return [...files].sort();
}

// Hash of the current on-disk content of a tour's code_paths. `git
// hash-object` yields the same blob id as the committed file when it is
// unchanged (so clean trees hash exactly as before), and also reflects
// uncommitted and untracked edits, so triage and drift agree.
export function computeCodePathsHash(codePaths, cwd = process.cwd()) {
  const files = resolveCodePathFiles(codePaths, cwd);
  const hash = createHash('sha256');
  for (const file of files) {
    let blobSha;
    try {
      blobSha = execFileSync('git', ['hash-object', '--', file], { cwd, encoding: 'utf8' }).trim();
    } catch {
      blobSha = 'unhashable';
    }
    hash.update(`${file}:${blobSha}\n`);
  }
  return hash.digest('hex');
}

// Best-effort short commit SHA for "when was this page last generated, and
// against which commit" reporting (state.json's generatedAtCommit — see
// generate-docs.mjs/generate-product-docs.mjs and lib/status.mjs). Falls
// back to 'unknown' outside a git repo or before the first commit — same
// "never guess, degrade gracefully" posture computeCodePathsHash's own
// git-failure fallback above already has.
export function resolveShortHeadCommit(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Which of a tour's (or the product pages') own declared source files
// actually changed since it was last generated — purely mechanical (a real
// `git diff` against the exact commit `generatedAtCommit` already records in
// state.json), not a summary or an inference. This is what lets a dirty-for-
// `code`/`inputs` report say *which* file(s), not just that something did —
// `plugin/scripts/drift.mjs`'s CLI report folds this into the line it
// prints, and the /document skill's Step 5 summary (which becomes the PR
// body) reads that report. Same file-resolution as computeCodePathsHash
// above, so "did the hash change" and "which files changed" never disagree
// about which files were even in scope.
//
// Degrades to an empty list — never throws — when there's nothing to diff
// against: no previous generation (`sinceCommit` undefined/falsy), a state
// entry that predates `generatedAtCommit` existing at all (`'unknown'`), or
// a commit that no longer resolves (e.g. a rebased-away history) — the
// caller still has the dirty reason itself; this is additive detail, not
// the source of truth for *whether* something is dirty.
export function resolveChangedCodePaths({ codePaths, sinceCommit, cwd = process.cwd() }) {
  if (!sinceCommit || sinceCommit === 'unknown') return [];
  const files = resolveCodePathFiles(codePaths, cwd);
  if (files.length === 0) return [];
  try {
    const output = execFileSync('git', ['diff', '--name-only', sinceCommit, 'HEAD', '--', ...files], {
      cwd,
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// The accessibility snapshots changed even though pixels may not have (a
// renamed button label). Only judged when both sides recorded a hash, so
// state written before this existed doesn't regenerate everything once.
function hasSemanticChange(previousEntry, currentA11yHash) {
  return Boolean(previousEntry?.a11yHash && currentA11yHash && previousEntry.a11yHash !== currentA11yHash);
}

// A tour is dirty if it has never been generated, or if its screenshot
// hashes, its code_paths hash, or its render hash (template/docs-layout/
// design-style — see lib/design.mjs's computeRenderHash) changed since the
// last generation. `draft` tours are never dirty — they're skipped by the
// gate entirely. Neither is a `proposed` tour (an auto-suggested draft
// awaiting human review — see Phase 7 in the brief): authorship confidence
// (`status`) is independent of UI stability (`maturity`), and either one
// gates alone. Neither is an `archived` tour (see lib/archive.mjs,
// lib/prune.mjs): its feature is gone, so there's nothing left to capture or
// regenerate — its existing page lives on under docs/archive/ instead.
//
// currentRenderHash is optional so every existing caller/test that predates
// the render hash keeps working unchanged; when it is passed, a previous
// entry with no `renderHash` at all (every state.json written before this
// feature existed) counts as changed too — those pages predate the current
// template and need one more regeneration to catch up.
export function isTourDirty({ tour, previousEntry, currentScreenshotHashes, currentCodePathsHash, currentRenderHash, currentA11yHash }) {
  if (tour.maturity === 'draft') return false;
  if (tour.status === 'proposed' || tour.status === 'archived') return false;
  if (!previousEntry) return true;
  const hashesChanged =
    JSON.stringify(previousEntry.screenshotHashes) !== JSON.stringify(currentScreenshotHashes);
  const codeChanged = previousEntry.codePathsHash !== currentCodePathsHash;
  const renderChanged = currentRenderHash !== undefined && previousEntry.renderHash !== currentRenderHash;
  const semanticsChanged = hasSemanticChange(previousEntry, currentA11yHash);
  return hashesChanged || codeChanged || renderChanged || semanticsChanged;
}

// Same inputs as isTourDirty, but explains *why* — which lets a caller (the
// /document skill's Step 3, plugin/scripts/drift.mjs's CLI report) tell a
// content change (screenshots/code — needs fresh doc-scribe prose) apart
// from a render-only change (template/docs-layout/design-style — the
// existing .docsolace/artifacts/prose/<id>.json is still grounded and
// correct; generate-docs.mjs just needs to re-assemble the page with it, no
// subagent dispatch required). Returns a subset of
// ['never-generated', 'screenshots', 'code', 'render']; empty when clean.
// Doesn't special-case draft/proposed — those are gate-level skips the
// caller already checks before asking why something is dirty.
export function getDirtyReasons({ previousEntry, currentScreenshotHashes, currentCodePathsHash, currentRenderHash, currentA11yHash }) {
  if (!previousEntry) return ['never-generated'];
  const reasons = [];
  if (JSON.stringify(previousEntry.screenshotHashes) !== JSON.stringify(currentScreenshotHashes)) {
    reasons.push('screenshots');
  }
  if (hasSemanticChange(previousEntry, currentA11yHash)) {
    reasons.push('semantics');
  }
  if (previousEntry.codePathsHash !== currentCodePathsHash) {
    reasons.push('code');
  }
  if (currentRenderHash !== undefined && previousEntry.renderHash !== currentRenderHash) {
    reasons.push('render');
  }
  return reasons;
}

// True when a tour is dirty *only* because of a render/layout/style change —
// its screenshots and code_paths are unchanged, so whatever prose already
// exists for it is still grounded and doesn't need doc-scribe to re-author.
export function isRenderOnlyDirty(reasons) {
  return reasons.length > 0 && reasons.every((r) => r === 'render');
}

// True when the captures or code changed since the last generation but the
// prose file is byte-identical to what that generation used — i.e. nobody
// re-authored it for the new captures. Render-only changes are fine (prose is
// still grounded), and entries from before proseHash existed can't be judged.
export function isProseStale({ previousEntry, proseHash, reasons }) {
  if (!previousEntry?.proseHash || !proseHash) return false;
  if (!reasons.some((r) => r === 'screenshots' || r === 'code' || r === 'semantics')) return false;
  return previousEntry.proseHash === proseHash;
}
