import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { pixelDiffRatio } from '../pixel-diff.mjs';

const tmpFiles = [];

function writeSolidPng(width, height, [r, g, b, a]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  }
  const filePath = path.join(os.tmpdir(), `autodocs-pixel-diff-${Date.now()}-${Math.random()}.png`);
  fs.writeFileSync(filePath, PNG.sync.write(png));
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  while (tmpFiles.length) fs.rmSync(tmpFiles.pop(), { force: true });
});

describe('pixelDiffRatio', () => {
  it('is 0 for two identical images', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const b = writeSolidPng(10, 10, [255, 0, 0, 255]);
    expect(pixelDiffRatio(a, b)).toBe(0);
  });

  it('is 1 for two fully different images', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const b = writeSolidPng(10, 10, [0, 0, 255, 255]);
    expect(pixelDiffRatio(a, b)).toBe(1);
  });

  it('is 1 when dimensions differ', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const b = writeSolidPng(20, 20, [255, 0, 0, 255]);
    expect(pixelDiffRatio(a, b)).toBe(1);
  });

  it('is 1 when either file is missing', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    expect(pixelDiffRatio(a, '/nonexistent/path.png')).toBe(1);
    expect(pixelDiffRatio('/nonexistent/path.png', a)).toBe(1);
  });
});
