import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Writes `content` to `filePath` atomically: write to a sibling temp file,
// then rename over the target. A crash mid-write leaves the temp file, never
// a half-written target — so readers never see corrupt JSON.
export function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

// Reads and parses a JSON file, returning `fallback` if it doesn't exist and
// surfacing a clear, actionable error (with the file path) instead of a bare
// SyntaxError if it's corrupt.
export function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `"${filePath}" is not valid JSON (${err.message}) — it may have been corrupted by an interrupted ` +
        `write. Delete it to regenerate from scratch, or restore it from git if it's tracked.`,
    );
  }
}

// Runs `fn` (a synchronous load-mutate-writeFileAtomic sequence) while
// holding an exclusive lock on a sibling `<filePath>.lock` file, so two
// concurrent updates to the same JSON file (e.g. two tours' manifest/state
// entries saved at once) can't race: the second writer's read has to wait
// for the first writer's read-modify-write to finish, instead of loading a
// stale copy and clobbering the first writer's update on its own write.
// `fs.openSync(..., 'wx')` fails with EEXIST if the lock is already held,
// which is what the retry loop polls on.
// A lock file is stale if the PID recorded in it no longer corresponds to a
// running process. process.kill(pid, 0) sends no actual signal — it's a
// pure liveness probe: throws ESRCH if the process is gone (stale), EPERM
// if it exists but we lack permission to signal it (alive, just not ours —
// NOT stale). An unreadable or unparseable lock (e.g. an empty one from
// before this check existed) is treated as *not* stale — never guess, fall
// back to the exact wait-then-fail behavior this replaces.
function isStaleLock(lockPath) {
  let pid;
  try {
    pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return err.code === 'ESRCH';
  }
}

export function withFileLock(filePath, fn, { retries = 200, retryDelayMs = 20 } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, `.${path.basename(filePath)}.lock`);

  let fd;
  for (let attempt = 0; ; attempt++) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // The process that held this lock is gone (crashed, OOM-killed,
      // machine slept mid-write) — safe to clear it ourselves rather than
      // making every future run burn the full retry window and require a
      // human to delete it by hand. Retried immediately, no sleep spent.
      if (isStaleLock(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (attempt >= retries) {
        throw new Error(
          `Timed out waiting for lock on "${filePath}" (held by another DocSolace process?). ` +
            `Delete "${lockPath}" if you're sure nothing else is running.`,
        );
      }
      // Node has no synchronous sleep; Atomics.wait on a throwaway buffer is
      // the standard portable way to block the main thread briefly.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
    }
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}
