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

// A tour is dirty if it has never been generated, or if either its
// screenshot hashes or its code_paths hash changed since the last generation.
// `draft` tours are never dirty — they're skipped by the gate entirely.
export function isTourDirty({ tour, previousEntry, currentScreenshotHashes, currentCodePathsHash }) {
  if (tour.maturity === 'draft') return false;
  if (!previousEntry) return true;
  const hashesChanged =
    JSON.stringify(previousEntry.screenshotHashes) !== JSON.stringify(currentScreenshotHashes);
  const codeChanged = previousEntry.codePathsHash !== currentCodePathsHash;
  return hashesChanged || codeChanged;
}
