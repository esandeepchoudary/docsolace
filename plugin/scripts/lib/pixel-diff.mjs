import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// PNG.sync.read throws a bare, file-agnostic pngjs message ("invalid file
// signature") on a truncated/corrupt PNG (e.g. from an interrupted
// capture) — rethrown here with the actual path and a concrete next step,
// since the raw error gives no way to tell which of two files is bad.
function readPng(pngPath) {
  try {
    return PNG.sync.read(fs.readFileSync(pngPath));
  } catch (err) {
    throw new Error(
      `"${pngPath}" is not a readable PNG (${err.message}) — it may be truncated from an interrupted ` +
        `capture. Delete it and re-run capture to regenerate it.`,
    );
  }
}

// Shared by pixelDiffRatio and writeDiffImage so they can't disagree on what
// counts as "different". Returns `diff: null` when the images can't be
// compared pixel-for-pixel (dimension mismatch) — there's no diff image to
// visualize in that case, only a ratio.
function diffImages(baselinePath, candidatePath) {
  const baseline = readPng(baselinePath);
  const candidate = readPng(candidatePath);
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return { ratio: 1, diff: null };
  }

  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(baseline.data, candidate.data, diff.data, width, height, {
    threshold: 0.1,
  });
  return { ratio: changedPixels / (width * height), diff };
}

// Fraction of pixels that differ between two PNGs, in [0, 1]. A missing
// baseline or a dimension change is treated as maximally different (1) so
// the caller always treats it as "needs committing".
export function pixelDiffRatio(baselinePath, candidatePath) {
  if (!fs.existsSync(baselinePath) || !fs.existsSync(candidatePath)) return 1;
  return diffImages(baselinePath, candidatePath).ratio;
}

// Writes a pixelmatch visualization (changed pixels highlighted) to
// `diffPath` for human review. Returns the diff ratio, or null if either
// image is missing or their dimensions don't match (nothing to visualize).
export function writeDiffImage(baselinePath, candidatePath, diffPath) {
  if (!fs.existsSync(baselinePath) || !fs.existsSync(candidatePath)) return null;
  const { ratio, diff } = diffImages(baselinePath, candidatePath);
  if (!diff) return null;

  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return ratio;
}
