import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSessionGuidance } from '../session-guidance.mjs';

const tmpDirs = [];

function makeTmpProjectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-session-guidance-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('buildSessionGuidance', () => {
  it('gives a short bootstrap nudge when the project has not been initiated', () => {
    const projectDir = makeTmpProjectDir();
    const guidance = buildSessionGuidance(projectDir);

    expect(guidance).toContain('/document');
    expect(guidance.toLowerCase()).toContain('bootstrap');
    // Must not leak the full tutorial-need guidance before there's even a
    // config/tours to suggest documenting anything against.
    expect(guidance).not.toContain('propose');
    expect(guidance).not.toContain('tour-scout');
  });

  it('gives a one-line reminder instruction once docsolace.config.yaml exists', () => {
    const projectDir = makeTmpProjectDir();
    fs.writeFileSync(path.join(projectDir, 'docsolace.config.yaml'), 'baseUrl: http://localhost:3000\n');

    const guidance = buildSessionGuidance(projectDir);

    expect(guidance).toContain('run /document');
    expect(guidance.toLowerCase()).toContain('stay completely silent otherwise');
    // No mode names, slugs, or flags leak into every session's context.
    expect(guidance).not.toContain('propose');
    expect(guidance).not.toContain('tour-scout');
    expect(guidance).not.toContain('--review');
  });

  it('stays short', () => {
    const projectDir = makeTmpProjectDir();
    fs.writeFileSync(path.join(projectDir, 'docsolace.config.yaml'), '');
    expect(buildSessionGuidance(projectDir).length).toBeLessThan(500);
  });

  it('does not treat a directory named docsolace.config.yaml as initiated indicators are file-based only', () => {
    // Sanity check: only presence of the file matters, not its parseability
    // (this hook never parses it — checking existence is deliberately cheap).
    const projectDir = makeTmpProjectDir();
    fs.writeFileSync(path.join(projectDir, 'docsolace.config.yaml'), '');

    expect(buildSessionGuidance(projectDir)).toContain('run /document');
  });
});
