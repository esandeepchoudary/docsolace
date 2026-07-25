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

// Hash of the git tree (at HEAD) for a tour's code_paths — changes only when
// the *committed* source backing a tour changes, not on uncommitted edits.
export function computeCodePathsHash(codePaths, cwd = process.cwd()) {
  const files = resolveCodePathFiles(codePaths, cwd);
  const hash = createHash('sha256');
  for (const file of files) {
    let blobSha;
    try {
      blobSha = execFileSync('git', ['rev-parse', `HEAD:${file}`], { cwd, encoding: 'utf8' }).trim();
    } catch {
      blobSha = 'untracked';
    }
    hash.update(`${file}:${blobSha}\n`);
  }
  return hash.digest('hex');
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
export function isTourDirty({ tour, previousEntry, currentScreenshotHashes, currentCodePathsHash, currentRenderHash }) {
  if (tour.maturity === 'draft') return false;
  if (tour.status === 'proposed' || tour.status === 'archived') return false;
  if (!previousEntry) return true;
  const hashesChanged =
    JSON.stringify(previousEntry.screenshotHashes) !== JSON.stringify(currentScreenshotHashes);
  const codeChanged = previousEntry.codePathsHash !== currentCodePathsHash;
  const renderChanged = currentRenderHash !== undefined && previousEntry.renderHash !== currentRenderHash;
  return hashesChanged || codeChanged || renderChanged;
}

// Same inputs as isTourDirty, but explains *why* — which lets a caller (the
// /document skill's Step 3, plugin/scripts/drift.mjs's CLI report) tell a
// content change (screenshots/code — needs fresh doc-scribe prose) apart
// from a render-only change (template/docs-layout/design-style — the
// existing .autodocs/artifacts/prose/<id>.json is still grounded and
// correct; generate-docs.mjs just needs to re-assemble the page with it, no
// subagent dispatch required). Returns a subset of
// ['never-generated', 'screenshots', 'code', 'render']; empty when clean.
// Doesn't special-case draft/proposed — those are gate-level skips the
// caller already checks before asking why something is dirty.
export function getDirtyReasons({ previousEntry, currentScreenshotHashes, currentCodePathsHash, currentRenderHash }) {
  if (!previousEntry) return ['never-generated'];
  const reasons = [];
  if (JSON.stringify(previousEntry.screenshotHashes) !== JSON.stringify(currentScreenshotHashes)) {
    reasons.push('screenshots');
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
