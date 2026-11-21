// A Playwright storage-state file holds live session cookies/tokens. Before
// one is written: refuse if git already tracks the path (it would be
// committed), warn if it's inside a repo but not ignored, and afterwards
// restrict it to the owner. Never throws outside a git repo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function checkAuthStatePath(statePath, cwd = process.cwd()) {
  const abs = path.resolve(cwd, statePath);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  if (!git(['rev-parse', '--is-inside-work-tree'], dir)) return { status: 'outside-repo' };
  if (git(['ls-files', '--error-unmatch', '--', abs], dir)) return { status: 'tracked' };
  if (git(['check-ignore', '-q', '--', abs], dir)) return { status: 'ignored' };
  return { status: 'unignored' };
}

export function assertAuthStatePathSafe(statePath, cwd = process.cwd()) {
  const { status } = checkAuthStatePath(statePath, cwd);
  if (status === 'tracked') {
    throw new Error(
      `"${statePath}" is tracked by git — a saved session there would be committed. ` +
        `Run \`git rm --cached ${statePath}\` and add it to .gitignore, or pick another storageStatePath.`,
    );
  }
  if (status === 'unignored') {
    console.warn(`  ! "${statePath}" is inside a git repo but not in .gitignore — add it so the session can't be committed.`);
  }
  return status;
}

export function restrictToOwner(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
    fs.chmodSync(path.dirname(filePath), 0o700);
  } catch {
    // best effort (e.g. Windows)
  }
}
