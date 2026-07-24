import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateProject, validateTour } from '../validate.mjs';

const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-validate-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function baseTour(overrides = {}) {
  return {
    id: 'example',
    title: 'Example',
    steps: [{ action: 'goto', path: '/' }, { capture: 'shot', description: 'x' }],
    ...overrides,
  };
}

describe('validateTour — auth', () => {
  it('errors when preconditions.auth names a profile absent from config.auth', () => {
    const config = { auth: {} };
    const tour = baseTour({ preconditions: { auth: 'missing-profile' } });

    const findings = validateTour(config, tour);

    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'error', tour: 'example', message: expect.stringContaining('missing-profile') }),
    );
  });

  it('does not error when config.auth is undefined entirely and no tour references auth', () => {
    const config = {};
    const tour = baseTour();
    expect(validateTour(config, tour)).toEqual([]);
  });

  it('warns when a storageStatePath auth profile has not recorded a session yet', () => {
    const config = { auth: { 'oauth-user': { storageStatePath: '/definitely/does/not/exist.json' } } };
    const tour = baseTour({ preconditions: { auth: 'oauth-user' } });

    const findings = validateTour(config, tour);

    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('storageStatePath') }),
    );
  });

  it('is clean when the storageStatePath file already exists', () => {
    const dir = makeTmpDir();
    const statePath = path.join(dir, 'session.json');
    fs.writeFileSync(statePath, '{}');
    const config = { auth: { 'oauth-user': { storageStatePath: statePath } } };
    const tour = baseTour({ preconditions: { auth: 'oauth-user' } });

    expect(validateTour(config, tour)).toEqual([]);
  });

  it('does not require config.auth to exist for a tour with no preconditions.auth', () => {
    expect(validateTour({}, baseTour())).toEqual([]);
  });
});

describe('validateTour — voice', () => {
  it('errors when preconditions.voice fixture does not exist', () => {
    const dir = makeTmpDir();
    const tour = baseTour({ preconditions: { voice: 'fixtures/sample-voice.wav' } });

    const findings = validateTour({}, tour, { cwd: dir });

    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('fixtures/sample-voice.wav') }),
    );
  });

  it('is clean when the voice fixture exists', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'fixtures', 'sample-voice.wav'), 'x');
    const tour = baseTour({ preconditions: { voice: 'fixtures/sample-voice.wav' } });

    expect(validateTour({}, tour, { cwd: dir })).toEqual([]);
  });

  it('does not require a voice fixture for a tour with no preconditions.voice', () => {
    expect(validateTour({}, baseTour())).toEqual([]);
  });
});

describe('validateTour — code_paths', () => {
  it('warns when code_paths matches no files under cwd', () => {
    const dir = makeTmpDir();
    const tour = baseTour({ code_paths: ['nowhere/**'] });

    const findings = validateTour({}, tour, { cwd: dir });

    expect(findings).toContainEqual(expect.objectContaining({ level: 'warn', message: expect.stringContaining('code_paths matched no files') }));
  });

  it('is clean when code_paths matches a real file', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '// x');
    const tour = baseTour({ code_paths: ['src/**'] });

    expect(validateTour({}, tour, { cwd: dir })).toEqual([]);
  });

  it('is a no-op when code_paths is absent', () => {
    expect(validateTour({}, baseTour())).toEqual([]);
  });
});

describe('validateTour — selectors', () => {
  it('warns on a click step whose selector is plain CSS, not a role=/text= locator', () => {
    const tour = baseTour({
      steps: [{ action: 'click', selector: '#submit-button' }],
    });

    const findings = validateTour({}, tour);

    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('#submit-button') }),
    );
  });

  it('is clean for a role= locator', () => {
    const tour = baseTour({ steps: [{ action: 'click', selector: "role=button[name='Submit']" }] });
    expect(validateTour({}, tour)).toEqual([]);
  });

  it('is clean for a text= locator', () => {
    const tour = baseTour({ steps: [{ action: 'click', selector: "text=Submit" }] });
    expect(validateTour({}, tour)).toEqual([]);
  });

  it('warns on a fill step whose selector is plain CSS — the check generalizes beyond click', () => {
    const tour = baseTour({
      steps: [{ action: 'fill', selector: '#search-box', value: 'hello' }],
    });

    const findings = validateTour({}, tour);

    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('#search-box') }),
    );
  });

  it('is clean for a select step with a role= locator', () => {
    const tour = baseTour({
      steps: [{ action: 'select', selector: "role=combobox[name='Status']", value: 'done' }],
    });
    expect(validateTour({}, tour)).toEqual([]);
  });

  it('is a no-op for step types with no selector at all (goto, capture)', () => {
    const tour = baseTour({ steps: [{ action: 'goto', path: '/' }, { capture: 'shot', description: 'x' }] });
    expect(validateTour({}, tour)).toEqual([]);
  });
});

describe('validateTour — upload', () => {
  it('errors when an upload step\'s fixture file does not exist', () => {
    const dir = makeTmpDir();
    const tour = baseTour({
      steps: [{ action: 'upload', selector: "input[type='file']", file: 'fixtures/sample.pcap' }],
    });

    const findings = validateTour({}, tour, { cwd: dir });

    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('fixtures/sample.pcap') }),
    );
  });

  it('is clean when the fixture file exists', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'fixtures', 'sample.pcap'), 'x');
    const tour = baseTour({
      steps: [{ action: 'upload', selector: "input[type='file']", file: 'fixtures/sample.pcap' }],
    });

    expect(validateTour({}, tour, { cwd: dir })).toEqual([]);
  });

  it('does not warn on an upload step\'s CSS selector, unlike a click step\'s', () => {
    // Regression guard: a real <input type="file"> has no meaningful
    // accessible role, so CSS is the documented-correct choice here — the
    // locator-style warning that fires for `click` steps must not fire for
    // `upload` steps.
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'fixtures', 'sample.pcap'), 'x');
    const tour = baseTour({
      steps: [{ action: 'upload', selector: "input[type='file']", file: 'fixtures/sample.pcap' }],
    });

    const findings = validateTour({}, tour, { cwd: dir });

    expect(findings.some((f) => f.message.includes('role=/text='))).toBe(false);
  });
});

describe('validateTour — happy path', () => {
  it('produces no findings for a fully clean tour', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '// x');
    const config = { auth: { 'standard-user': { loginUrl: '/login' } } };
    const tour = baseTour({
      preconditions: { auth: 'standard-user' },
      code_paths: ['src/**'],
      steps: [
        { action: 'goto', path: '/dashboard' },
        { action: 'click', selector: "role=button[name='Filters']" },
        { capture: 'dashboard-full', description: 'x' },
      ],
    });

    expect(validateTour(config, tour, { cwd: dir })).toEqual([]);
  });
});

describe('validateProject', () => {
  it('flattens findings across multiple tours', () => {
    const config = { auth: {} };
    const tours = [
      baseTour({ id: 'a', preconditions: { auth: 'missing-a' } }),
      baseTour({ id: 'b', preconditions: { auth: 'missing-b' } }),
    ];

    const findings = validateProject(config, tours);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.tour).sort()).toEqual(['a', 'b']);
  });
});
