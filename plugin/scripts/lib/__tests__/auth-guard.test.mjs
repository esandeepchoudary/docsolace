import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertAuthStatePathSafe, checkAuthStatePath, restrictToOwner } from '../auth-guard.mjs';

const dirs = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-guard-'));
  dirs.push(dir);
  const run = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.email', 't@t');
  run('config', 'user.name', 't');
  return { dir, run };
}

describe('checkAuthStatePath', () => {
  it('reports ignored, unignored and tracked paths', () => {
    const { dir, run } = repo();
    fs.writeFileSync(path.join(dir, '.gitignore'), '.auth/\n');
    expect(checkAuthStatePath('.auth/a.json', dir).status).toBe('ignored');
    expect(checkAuthStatePath('state/a.json', dir).status).toBe('unignored');
    fs.writeFileSync(path.join(dir, 'state', 'a.json'), '{}');
    run('add', '-f', 'state/a.json');
    expect(checkAuthStatePath('state/a.json', dir).status).toBe('tracked');
  });

  it('refuses a tracked path', () => {
    const { dir, run } = repo();
    fs.mkdirSync(path.join(dir, 's'));
    fs.writeFileSync(path.join(dir, 's', 'a.json'), '{}');
    run('add', '.');
    expect(() => assertAuthStatePathSafe(path.join(dir, 's', 'a.json'), dir)).toThrow(/tracked by git/);
  });

  it('is quiet outside a repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-guard-nogit-'));
    dirs.push(dir);
    expect(checkAuthStatePath('a.json', dir).status).toBe('outside-repo');
  });
});

describe('restrictToOwner', () => {
  it.skipIf(process.platform === 'win32')('sets 0600 on the file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-guard-mode-'));
    dirs.push(dir);
    const f = path.join(dir, 'a.json');
    fs.writeFileSync(f, '{}', { mode: 0o644 });
    restrictToOwner(f);
    expect(fs.statSync(f).mode & 0o777).toBe(0o600);
  });
});
