import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Fraction of pixels that differ between two PNGs, in [0, 1]. A missing
// baseline or a dimension change is treated as maximally different (1) so
// the caller always treats it as "needs committing".
export function pixelDiffRatio(baselinePath, candidatePath) {
  if (!fs.existsSync(baselinePath) || !fs.existsSync(candidatePath)) return 1;

  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const candidate = PNG.sync.read(fs.readFileSync(candidatePath));
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) return 1;

  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(baseline.data, candidate.data, diff.data, width, height, {
    threshold: 0.1,
  });
  return changedPixels / (width * height);
}
