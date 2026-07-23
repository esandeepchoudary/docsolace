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
export function withFileLock(filePath, fn, { retries = 200, retryDelayMs = 20 } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, `.${path.basename(filePath)}.lock`);

  let fd;
  for (let attempt = 0; ; attempt++) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (attempt >= retries) {
        throw new Error(
          `Timed out waiting for lock on "${filePath}" (held by another AutoDocs process?). ` +
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
