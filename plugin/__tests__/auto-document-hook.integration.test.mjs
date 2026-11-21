// Runs the real Stop-hook script in a throwaway git project with a real local
// HTTP server standing in for the app.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.join(import.meta.dirname, '..', 'scripts', 'auto-document.mjs');
let dir;
let server;
let port;

beforeEach(async () => {
  server = http.createServer((_, res) => res.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-hook-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/Login.jsx'), 'v1');
  fs.mkdirSync(path.join(dir, 'tours'));
  fs.writeFileSync(
    path.join(dir, 'tours/login.yaml'),
    'id: login\ntitle: Login\nintent: x\nmaturity: stable\nstatus: confirmed\nsteps:\n  - action: goto\n    path: /\ncode_paths:\n  - src/Login.jsx\n',
  );
  writeConfig('autoDocument: true\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  git('checkout', '-qb', 'feat/login');
  fs.writeFileSync(path.join(dir, 'src/Login.jsx'), 'v2'); // uncommitted UI change a tour covers
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeConfig(extra, url = () => `http://127.0.0.1:${port}`) {
  fs.writeFileSync(
    path.join(dir, 'docsolace.config.yaml'),
    `baseUrl: ${url()}\nviewports:\n  desktop:\n    width: 100\n    height: 100\noutputDir: .docsolace/artifacts\n${extra}`,
  );
}

// Async on purpose: the hook probes the app over HTTP, and a blocking spawn
// would freeze this process's own test server.
function runHook(input = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script], { cwd: dir });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => {
      expect(code).toBe(0);
      resolve(out.trim() ? JSON.parse(out) : null);
    });
    child.stdin.end(JSON.stringify({ cwd: dir, ...input }));
  });
}

describe('Stop hook', () => {
  it('asks Claude to resync a covered tour whose code changed, once', async () => {
    const out = await runHook();
    expect(out.decision).toBe('block');
    expect(out.reason).toContain('login');
    expect(out.reason).toContain('feat/login');
    // Same change again: already asked, so silent.
    expect(await runHook()).toBeNull();
  });

  it('asks again after the code changes further (cooldown disabled)', async () => {
    writeConfig('autoDocument: true\nautoDocumentMinMinutes: 0\n');
    expect((await runHook()).decision).toBe('block');
    fs.writeFileSync(path.join(dir, 'src/Login.jsx'), 'v3');
    expect((await runHook()).decision).toBe('block');
  });

  it('is silent unless opted in', async () => {
    writeConfig('');
    expect(await runHook()).toBeNull();
    writeConfig('autoDocument: false\n');
    expect(await runHook()).toBeNull();
  });

  it('never chains off its own continuation', async () => {
    expect(await runHook({ stop_hook_active: true })).toBeNull();
  });

  it('is silent when the app is not running', async () => {
    await new Promise((r) => server.close(r));
    server = http.createServer();
    expect(await runHook()).toBeNull();
    await new Promise((r) => server.listen(port, '127.0.0.1', r)); // so afterEach can close it
  });

  it('is silent when nothing a tour covers changed', async () => {
    execFileSync('git', ['checkout', '--', '.'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'src/Other.jsx'), 'x');
    expect(await runHook()).toBeNull();
  });

  it('never throws on a broken project', async () => {
    fs.writeFileSync(path.join(dir, 'docsolace.config.yaml'), 'autoDocument: [oops');
    expect(await runHook()).toBeNull();
  });
});
