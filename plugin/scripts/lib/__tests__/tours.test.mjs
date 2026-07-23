import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTour } from '../tours.mjs';

const tmpDirs = [];

function writeTmpTour(fileName, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tours-test-'));
  fs.writeFileSync(path.join(dir, fileName), contents);
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('loadTour', () => {
  it('loads a valid tour with goto/capture/click steps', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      `
id: demo
steps:
  - action: goto
    path: /demo
  - capture: demo-full
    description: "Full page"
  - action: click
    selector: "role=button[name='Go']"
`,
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.id).toBe('demo');
    expect(tour.steps).toHaveLength(3);
  });

  it('throws when the tour file does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tours-test-'));
    tmpDirs.push(dir);
    expect(() => loadTour(dir, 'missing')).toThrow(/not found/);
  });

  it('throws when "id" is missing', () => {
    const dir = writeTmpTour('demo.yaml', 'steps:\n  - action: goto\n    path: /demo\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/"id"/);
  });

  it('throws when "steps" is missing or empty', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps: []\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/steps/);
  });

  it('throws when a step is not a valid goto/click/capture', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps:\n  - action: fly\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });
});
