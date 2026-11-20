import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTriageReport,
  classifyChangedFiles,
  extractCodePathsLeniently,
  isUiFile,
  listChangedFiles,
  parseTriageArgs,
  routeArguments,
  slugifyDescription,
} from '../triage.mjs';
import { SLUG_RE } from '../tours.mjs';

const tmpDirs = [];

function mkTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-triage-test-'));
  tmpDirs.push(dir);
  return dir;
}

function write(dir, rel, content = 'x') {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('isUiFile', () => {
  it('accepts frontend source files', () => {
    expect(isUiFile('src/pages/Billing.jsx')).toBe(true);
    expect(isUiFile('app/views/index.erb')).toBe(true);
    expect(isUiFile('src/styles/app.css')).toBe(true);
  });

  it('rejects tests, configs, docs, tours, and non-UI files', () => {
    expect(isUiFile('src/pages/Billing.test.jsx')).toBe(false);
    expect(isUiFile('src/__tests__/a.js')).toBe(false);
    expect(isUiFile('vite.config.js')).toBe(false);
    expect(isUiFile('README.md')).toBe(false);
    expect(isUiFile('package-lock.json')).toBe(false);
    expect(isUiFile('tours/login.yaml')).toBe(false);
    expect(isUiFile('docs/login.md')).toBe(false);
    expect(isUiFile('node_modules/x/index.js')).toBe(false);
    expect(isUiFile('logo.png')).toBe(false);
  });
});

describe('isUiFile — backend and nesting (review findings)', () => {
  it('does not treat generic script files outside UI directories as UI', () => {
    expect(isUiFile('server/routes/users.js')).toBe(false);
    expect(isUiFile('lib/db.ts')).toBe(false);
    expect(isUiFile('packages/api/src/x.ts')).toBe(false);
    expect(isUiFile('plugin/scripts/lib/triage.mjs')).toBe(false);
  });

  it('counts generic script files under a UI directory', () => {
    expect(isUiFile('src/components/Chart.js')).toBe(true);
    expect(isUiFile('packages/web/src/pages/Home.ts')).toBe(true);
  });

  it('applies ignores at any depth', () => {
    expect(isUiFile('packages/x/dist/a.jsx')).toBe(false);
    expect(isUiFile('src/__tests__/Foo.jsx')).toBe(false);
    expect(isUiFile('apps/web/node_modules/y/z.jsx')).toBe(false);
  });
});

describe('isUiFile — round 2', () => {
  it('counts flat src/ layouts (CRA, Vite, Vue)', () => {
    expect(isUiFile('src/App.js')).toBe(true);
    expect(isUiFile('src/BillingPage.js')).toBe(true);
    expect(isUiFile('src/main.ts')).toBe(true);
  });

  it('still rejects backend directories nested under src', () => {
    expect(isUiFile('src/server/index.js')).toBe(false);
    expect(isUiFile('src/api/client.ts')).toBe(false);
    expect(isUiFile('src/lib/format.js')).toBe(false);
  });

  it('does not treat Laravel app/ PHP or vendored public/ scripts as UI', () => {
    expect(isUiFile('app/Http/Controllers/UserController.php')).toBe(false);
    expect(isUiFile('public/vendor/chart.min.js')).toBe(false);
    expect(isUiFile('resources/views/billing.php')).toBe(true);
  });

  it('only ignores build/ at the repo root', () => {
    expect(isUiFile('build/out.jsx')).toBe(false);
    expect(isUiFile('src/build/Wizard.jsx')).toBe(true);
  });
});

describe('classifyChangedFiles', () => {
  it('maps changed files to the confirmed tours whose code_paths own them', () => {
    const dir = mkTmpDir();
    write(dir, 'src/pages/Login.jsx');
    write(dir, 'src/pages/Billing.jsx');
    const tours = [{ id: 'login', status: 'confirmed', code_paths: ['src/pages/Login.jsx'] }];

    const result = classifyChangedFiles({
      changedFiles: ['src/pages/Login.jsx', 'src/pages/Billing.jsx'],
      tours,
      cwd: dir,
    });

    expect(result.resync).toEqual([{ tourId: 'login', files: ['src/pages/Login.jsx'] }]);
    expect(result.uncovered).toEqual(['src/pages/Billing.jsx']);
  });

  it('supports glob code_paths', () => {
    const dir = mkTmpDir();
    write(dir, 'src/pages/Dash/Chart.jsx');
    const tours = [{ id: 'dash', code_paths: ['src/pages/Dash/**'] }];
    const result = classifyChangedFiles({ changedFiles: ['src/pages/Dash/Chart.jsx'], tours, cwd: dir });
    expect(result.resync.map((r) => r.tourId)).toEqual(['dash']);
    expect(result.uncovered).toEqual([]);
  });

  it('ignores proposed/archived tours as coverage', () => {
    const dir = mkTmpDir();
    write(dir, 'src/Old.jsx');
    const tours = [{ id: 'old', status: 'archived', code_paths: ['src/Old.jsx'] }];
    const result = classifyChangedFiles({ changedFiles: ['src/Old.jsx'], tours, cwd: dir });
    expect(result.resync).toEqual([]);
    expect(result.uncovered).toEqual(['src/Old.jsx']);
  });

  it('never reports non-UI files as uncovered', () => {
    const dir = mkTmpDir();
    const result = classifyChangedFiles({ changedFiles: ['README.md', 'package.json'], tours: [], cwd: dir });
    expect(result).toEqual({ resync: [], uncovered: [] });
  });
});

describe('slugifyDescription', () => {
  it('derives a valid kebab-case slug, dropping filler words', () => {
    expect(slugifyDescription('the new Export CSV button on the dashboard')).toBe('export-csv-button-dashboard');
  });

  it('always satisfies SLUG_RE and stays short', () => {
    const slug = slugifyDescription('A very long description '.repeat(10));
    expect(slug).toMatch(SLUG_RE);
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it('de-duplicates against existing ids', () => {
    expect(slugifyDescription('billing page', ['billing-page'])).toBe('billing-page-2');
    expect(slugifyDescription('billing page', ['billing-page', 'billing-page-2'])).toBe('billing-page-3');
  });

  it('strips diacritics instead of emitting garbage slugs', () => {
    expect(slugifyDescription('página de facturación')).toBe('pagina-de-facturacion');
  });

  it('truncates on a word boundary, not mid-word', () => {
    const slug = slugifyDescription('configuration management dashboard overview screen');
    expect(slug).toBe('configuration-management-dashboard');
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it('falls back to "feature" for empty or symbol-only input', () => {
    expect(slugifyDescription('')).toBe('feature');
    expect(slugifyDescription('!!!')).toBe('feature');
  });

  it('neutralizes path-traversal-looking input', () => {
    expect(slugifyDescription('../../etc/passwd')).toMatch(SLUG_RE);
  });
});

describe('routeArguments', () => {
  const ctx = { knownModes: ['propose', 'map', 'status'], tourIds: ['login', 'billing-page'] };

  it('routes empty args (and bare flags) to the pipeline', () => {
    expect(routeArguments('', ctx)).toEqual({ kind: 'pipeline' });
    expect(routeArguments('--review', ctx)).toEqual({ kind: 'pipeline' });
    expect(routeArguments(undefined, ctx)).toEqual({ kind: 'pipeline' });
  });

  it('routes a known mode word', () => {
    expect(routeArguments('map --interactive', ctx)).toEqual({ kind: 'mode', mode: 'map' });
    expect(routeArguments('status', ctx)).toEqual({ kind: 'mode', mode: 'status' });
  });

  it('does not treat a description that merely starts with a mode word as that mode', () => {
    for (const text of ['product listing page', 'map view of orders', 'status badge', 'validate form']) {
      expect(routeArguments(text, { knownModes: [...ctx.knownModes, 'product', 'validate'], tourIds: [] })).toEqual({
        kind: 'describe',
        description: text,
      });
    }
  });

  it('lets flags carry values and modes take a tour id', () => {
    expect(routeArguments('map --depth 2', ctx)).toEqual({ kind: 'mode', mode: 'map' });
    expect(routeArguments('status login', ctx)).toEqual({ kind: 'mode', mode: 'status' });
  });

  it('still routes propose with arguments to the propose mode', () => {
    expect(routeArguments('propose export "the export button"', ctx)).toEqual({ kind: 'mode', mode: 'propose' });
  });

  it('routes an existing tour id', () => {
    expect(routeArguments('login --no-style', ctx)).toEqual({ kind: 'tour', tourId: 'login' });
  });

  it('treats anything else as a free-text feature description', () => {
    expect(routeArguments('the new billing page --review', ctx)).toEqual({
      kind: 'describe',
      description: 'the new billing page',
    });
  });
});

describe('listChangedFiles', () => {
  it('returns [] outside a git repo', () => {
    expect(listChangedFiles(mkTmpDir())).toEqual([]);
  });

  it('includes branch commits, uncommitted edits, and untracked files', () => {
    const dir = mkTmpDir();
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 't');
    write(dir, 'a.js');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
    git(dir, 'checkout', '-q', '-b', 'feat/x');
    write(dir, 'b.js');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'b');
    write(dir, 'a.js', 'changed');
    write(dir, 'c.js');

    expect(listChangedFiles(dir)).toEqual(['a.js', 'b.js', 'c.js']);
  });
});

describe('listChangedFiles — deletions and subdirectories', () => {
  function initRepo(dir) {
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 't');
  }

  it('omits deleted files', () => {
    const dir = mkTmpDir();
    initRepo(dir);
    write(dir, 'src/OldBilling.jsx');
    write(dir, 'src/Keep.jsx');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
    fs.rmSync(path.join(dir, 'src/OldBilling.jsx'));
    write(dir, 'src/Keep.jsx', 'changed');
    expect(listChangedFiles(dir)).toEqual(['src/Keep.jsx']);
  });

  it('returns paths relative to cwd when the project is a repo subdirectory', () => {
    const repo = mkTmpDir();
    initRepo(repo);
    write(repo, 'apps/web/src/Login.jsx');
    write(repo, 'other/x.jsx');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'init');
    write(repo, 'apps/web/src/Login.jsx', 'changed');
    write(repo, 'apps/web/src/New.jsx');
    write(repo, 'other/x.jsx', 'changed');

    expect(listChangedFiles(path.join(repo, 'apps/web'))).toEqual(['src/Login.jsx', 'src/New.jsx']);
  });
});

describe('parseTriageArgs', () => {
  it('parses --args and --description values', () => {
    expect(parseTriageArgs(['--args', 'the billing page', '--description', 'x'])).toEqual({
      args: 'the billing page',
      description: 'x',
    });
  });

  it('keeps an empty --args value and a value that starts with --', () => {
    expect(parseTriageArgs(['--args', ''])).toEqual({ args: '' });
    expect(parseTriageArgs(['--args', '--review'])).toEqual({ args: '--review' });
  });

  it('does not re-test a consumed value as a flag', () => {
    expect(parseTriageArgs(['--description', '--args'])).toEqual({ description: '--args' });
  });

  it('returns {} when no flags are given', () => {
    expect(parseTriageArgs([])).toEqual({});
  });
});

describe('buildTriageReport', () => {
  function project() {
    const dir = mkTmpDir();
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 't');
    write(dir, 'src/Login.jsx');
    write(
      dir,
      'tours/login.yaml',
      "id: login\ntitle: Login\ncode_paths:\n  - src/Login.jsx\nsteps:\n  - capture: full\n    description: x\n",
    );
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
    return dir;
  }

  it('routes args and derives a slug', () => {
    const dir = project();
    const report = buildTriageReport({ cwd: dir, rawArgs: 'the login page', description: 'the login page' });
    expect(report.route).toEqual({ kind: 'describe', description: 'the login page' });
    expect(report.suggestedSlug).toBe('login-page');
    expect(report.changedFiles).toBeUndefined();
  });

  it('classifies changes on a bare run', () => {
    const dir = project();
    write(dir, 'src/Login.jsx', 'changed');
    write(dir, 'src/Billing.jsx');
    const report = buildTriageReport({ cwd: dir });
    expect(report.resync).toEqual([{ tourId: 'login', files: ['src/Login.jsx'] }]);
    expect(report.uncovered).toEqual(['src/Billing.jsx']);
  });

  it('does not fail on a malformed tour or non-slug filename; reports both', () => {
    const dir = project();
    write(dir, 'tours/broken.yaml', 'id: [unclosed\n');
    write(dir, 'tours/My_Tour.yaml', 'id: x\n');
    write(dir, 'src/Login.jsx', 'changed');
    const report = buildTriageReport({ cwd: dir });
    expect(report.skippedTours.map((t) => t.tourId).sort()).toEqual(['My_Tour', 'broken']);
    expect(report.skippedTours.find((t) => t.tourId === 'My_Tour').error).toContain('kebab-case');
    expect(report.note).toContain('validate.mjs');
    expect(report.resync.map((r) => r.tourId)).toEqual(['login']);
  });

  it('still counts a malformed tour\'s code_paths as coverage (no bogus "uncovered")', () => {
    const dir = project();
    write(dir, 'src/Billing.jsx');
    write(dir, 'tours/billing.yaml', 'id: billing\ncode_paths:\n  - src/Billing.jsx\nsteps: [unclosed\n');
    write(dir, 'src/Billing.jsx', 'changed');
    const report = buildTriageReport({ cwd: dir });
    expect(report.skippedTours.map((t) => t.tourId)).toEqual(['billing']);
    expect(report.uncovered).toEqual([]);
    expect(report.resync).toEqual([{ tourId: 'billing', files: ['src/Billing.jsx'] }]);
  });

  it('works with no tours/ directory', () => {
    const dir = mkTmpDir();
    expect(buildTriageReport({ cwd: dir })).toMatchObject({ changedFiles: [], resync: [], uncovered: [] });
  });
});

describe('extractCodePathsLeniently', () => {
  it('reads list items under code_paths and stops at the next key', () => {
    const text = 'id: x\ncode_paths:\n  - src/A.jsx\n  - "src/B.jsx" # note\nsteps:\n  - capture: y\n';
    expect(extractCodePathsLeniently(text)).toEqual(['src/A.jsx', 'src/B.jsx']);
  });

  it('returns [] when there is no code_paths block', () => {
    expect(extractCodePathsLeniently('id: x\n')).toEqual([]);
  });
});

describe('listChangedFiles — non-ASCII names', () => {
  it('returns unquoted paths for non-ASCII filenames', () => {
    const dir = mkTmpDir();
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 't');
    write(dir, 'a.js');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
    write(dir, 'src/página.jsx');
    expect(listChangedFiles(dir)).toEqual(['src/página.jsx']);
  });
});
