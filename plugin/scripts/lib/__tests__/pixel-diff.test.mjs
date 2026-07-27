import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { pixelDiffRatio, writeDiffImage } from '../pixel-diff.mjs';

const tmpFiles = [];
const tmpDirs = [];

function writeSolidPng(width, height, [r, g, b, a]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  }
  const filePath = path.join(os.tmpdir(), `docsolace-pixel-diff-${Date.now()}-${Math.random()}.png`);
  fs.writeFileSync(filePath, PNG.sync.write(png));
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  while (tmpFiles.length) fs.rmSync(tmpFiles.pop(), { force: true });
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
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

  it('throws an error naming the file path (not a bare pngjs message) for a corrupt/truncated PNG', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const corruptPath = path.join(os.tmpdir(), `docsolace-pixel-diff-corrupt-${Date.now()}-${Math.random()}.png`);
    fs.writeFileSync(corruptPath, 'not actually a png');
    tmpFiles.push(corruptPath);

    expect(() => pixelDiffRatio(a, corruptPath)).toThrow(corruptPath);
    expect(() => pixelDiffRatio(a, corruptPath)).toThrow(/not a readable PNG/);
    expect(() => pixelDiffRatio(corruptPath, a)).toThrow(corruptPath);
  });
});

describe('writeDiffImage', () => {
  function tmpDiffPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-diff-test-'));
    tmpDirs.push(dir);
    return path.join(dir, 'nested', 'diff.png');
  }

  it('writes a valid PNG and returns the ratio for two different images', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const b = writeSolidPng(10, 10, [0, 0, 255, 255]);
    const diffPath = tmpDiffPath();
    const ratio = writeDiffImage(a, b, diffPath);
    expect(ratio).toBe(1);
    expect(fs.existsSync(diffPath)).toBe(true);
    expect(() => PNG.sync.read(fs.readFileSync(diffPath))).not.toThrow();
  });

  it('returns null and writes nothing when dimensions differ', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const b = writeSolidPng(20, 20, [255, 0, 0, 255]);
    const diffPath = tmpDiffPath();
    expect(writeDiffImage(a, b, diffPath)).toBeNull();
    expect(fs.existsSync(diffPath)).toBe(false);
  });

  it('throws an error naming the file path (not a bare pngjs message) for a corrupt/truncated PNG', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    const corruptPath = path.join(os.tmpdir(), `docsolace-diff-corrupt-${Date.now()}-${Math.random()}.png`);
    fs.writeFileSync(corruptPath, 'not actually a png');
    tmpFiles.push(corruptPath);

    expect(() => writeDiffImage(a, corruptPath, tmpDiffPath())).toThrow(corruptPath);
  });

  it('returns null when either image is missing', () => {
    const a = writeSolidPng(10, 10, [255, 0, 0, 255]);
    expect(writeDiffImage(a, '/nonexistent/path.png', tmpDiffPath())).toBeNull();
  });
});
