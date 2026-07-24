import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSessionGuidance } from '../session-guidance.mjs';

const tmpDirs = [];

function makeTmpProjectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-session-guidance-'));
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
    expect(guidance).not.toContain('/document propose');
    expect(guidance).not.toContain('tour-scout');
  });

  it('gives the full tutorial-need guidance once autodocs.config.yaml exists', () => {
    const projectDir = makeTmpProjectDir();
    fs.writeFileSync(path.join(projectDir, 'autodocs.config.yaml'), 'baseUrl: http://localhost:3000\n');

    const guidance = buildSessionGuidance(projectDir);

    expect(guidance).toContain('/document propose <slug>');
    expect(guidance).toContain('tour-scout');
    expect(guidance.toLowerCase()).toContain("don't silently decide");
    // The tour-need suggestion itself is still a suggestion — but once the
    // human runs it, it now carries through to an opened PR by default
    // instead of stopping for a manual status: confirmed flip.
    expect(guidance).toContain('--review');
    expect(guidance.toLowerCase()).toContain('never auto-merged');
    expect(guidance.toLowerCase()).toContain('hard stop');
  });

  it('does not treat a directory named autodocs.config.yaml as initiated indicators are file-based only', () => {
    // Sanity check: only presence of the file matters, not its parseability
    // (this hook never parses it — checking existence is deliberately cheap).
    const projectDir = makeTmpProjectDir();
    fs.writeFileSync(path.join(projectDir, 'autodocs.config.yaml'), '');

    expect(buildSessionGuidance(projectDir)).toContain('/document propose <slug>');
  });
});
