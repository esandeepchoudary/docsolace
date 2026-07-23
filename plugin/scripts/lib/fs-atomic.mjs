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
