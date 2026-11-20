// Mechanical triage for a bare `/document` run: given the files a branch
// changed, which existing tours do they belong to (resync those), and which
// UI-looking files belong to no tour at all (a candidate new tutorial)?
//
// Deliberately file-based, never a guess at "what the feature is" — naming
// and describing a feature is the human's (or tour-scout's) job. This only
// answers "did anything change that a tour already covers, or that no tour
// covers", the same mechanical posture as drift.mjs's resolveChangedCodePaths.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCodePathFiles } from './drift.mjs';
import { SLUG_RE, loadTour } from './tours.mjs';

// Source files that plausibly render UI. Extensions that are unambiguously
// frontend count anywhere; generic script extensions (.js/.ts/.mjs/.php) also
// power backends and tooling, so they only count under a UI-ish directory.
const UI_EXTENSIONS = new Set([
  '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.html',
  '.css', '.scss', '.sass', '.less', '.erb', '.ejs', '.hbs', '.njk',
]);
const AMBIGUOUS_EXTENSIONS = new Set(['.js', '.mjs', '.ts']);
// Generic script files count when they sit under a frontend-ish directory
// (`src/` covers flat CRA/Vite/Vue layouts) and no backend-ish directory.
const UI_DIRS = new Set([
  'src', 'components', 'component', 'pages', 'views', 'screens', 'ui', 'frontend', 'client',
  'web', 'templates', 'layouts',
]);
const BACKEND_DIRS = new Set([
  'server', 'api', 'lib', 'routes', 'controllers', 'models', 'middleware', 'services', 'db',
  'migrations', 'bin', 'cli', 'backend', 'utils', 'helpers',
]);
// .php is mostly backend (Laravel `app/`), so only genuine template dirs count.
const PHP_UI_DIRS = new Set(['views', 'templates', 'layouts', 'pages', 'components']);

// Directories that are never UI source, at any depth (monorepos nest them).
const IGNORED_ANYWHERE = new Set(['node_modules', 'dist', '.next', 'fixtures', 'test', 'tests', '__tests__']);
// Directories that only count as non-UI at the repo root (a nested `build/`
// or `scripts/` can legitimately be a UI feature name).
const IGNORED_ROOT = new Set(['.docsolace', 'tours', 'docs', 'site', 'scripts', '.github', 'build']);

const TEST_FILE_RE = /(?:\.|-)(?:test|spec|stories)\.[a-z]+$/;
const CONFIG_FILE_RE = /(?:^|\/)[^/]*\.config\.[a-z]+$/;

export function isUiFile(file) {
  const normalized = file.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const dirs = segments.slice(0, -1);
  if (IGNORED_ROOT.has(segments[0]) && segments.length > 1) return false;
  if (dirs.some((d) => IGNORED_ANYWHERE.has(d))) return false;
  if (TEST_FILE_RE.test(normalized) || CONFIG_FILE_RE.test(normalized)) return false;
  const ext = path.extname(normalized).toLowerCase();
  if (UI_EXTENSIONS.has(ext)) return true;
  if (dirs.some((d) => BACKEND_DIRS.has(d))) return false;
  if (ext === '.php') return dirs.some((d) => PHP_UI_DIRS.has(d));
  return AMBIGUOUS_EXTENSIONS.has(ext) && dirs.some((d) => UI_DIRS.has(d));
}

// Splits changed files into: tours whose code_paths contain at least one of
// them (resync), and UI files no tour's code_paths cover (uncovered).
// Only `confirmed` tours count as coverage — a proposed/archived tour isn't
// something a resync would touch.
export function classifyChangedFiles({ changedFiles, tours, cwd = process.cwd() }) {
  const changed = [...new Set(changedFiles.map((f) => f.replace(/\\/g, '/')))];
  const coveredFiles = new Set();
  const resync = [];

  for (const tour of tours) {
    if ((tour.status ?? 'confirmed') !== 'confirmed') continue;
    const owned = new Set(resolveCodePathFiles(tour.code_paths ?? [], cwd).map((f) => f.replace(/\\/g, '/')));
    const hits = changed.filter((f) => owned.has(f));
    if (hits.length > 0) {
      resync.push({ tourId: tour.id, files: hits });
      hits.forEach((f) => coveredFiles.add(f));
    }
  }

  const uncovered = changed.filter((f) => isUiFile(f) && !coveredFiles.has(f));
  return { resync, uncovered };
}

// Turns a free-text description ("the new Export CSV button on the
// dashboard") into a safe tour slug, de-duplicated against existing ids.
const STOPWORDS = new Set(['the', 'a', 'an', 'new', 'on', 'in', 'of', 'to', 'for', 'and', 'my', 'our', 'this', 'that']);
const MAX_SLUG_LENGTH = 40;

export function slugifyDescription(description, existingIds = []) {
  const words = String(description ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  // Truncate on a word boundary, not mid-word.
  let slug = '';
  for (const word of meaningful.length > 0 ? meaningful : words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG_LENGTH) break;
    slug = next;
  }
  if (!slug) slug = (meaningful[0] ?? words[0] ?? '').slice(0, MAX_SLUG_LENGTH);
  if (!slug) slug = 'feature';

  const taken = new Set(existingIds);
  let candidate = slug;
  for (let n = 2; taken.has(candidate); n++) {
    const suffix = `-${n}`;
    candidate = `${slug.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
  }
  if (!SLUG_RE.test(candidate)) throw new Error(`Could not derive a valid slug from "${description}".`);
  return candidate;
}

// Decides how a bare argument string should be routed. `knownModes` are the
// literal first words the skill already handles; `tourIds` are existing
// tours. A mode word only counts as a mode when nothing but flags follows it
// (`map --interactive`), or it is `propose` (which takes a slug and a
// description). Otherwise "product listing page" or "map view of orders" is a
// feature description that merely starts with a mode-shaped word.
export function routeArguments(argString, { knownModes, tourIds }) {
  const text = String(argString ?? '')
    .replace(/--(?:review|no-style)\b/g, '')
    .trim();
  if (text === '') return { kind: 'pipeline' };
  const [first, ...rest] = text.split(/\s+/);
  // After a mode word, only flags, a flag's value, or an existing tour id may
  // follow (`map --depth 2`, `validate login`) — anything else is prose.
  const modeArgsOnly = rest.every(
    (w, i) => w.startsWith('--') || (i > 0 && rest[i - 1].startsWith('--')) || tourIds.includes(w),
  );
  if (knownModes.includes(first) && (first === 'propose' || modeArgsOnly)) {
    return { kind: 'mode', mode: first };
  }
  if (tourIds.includes(text)) return { kind: 'tour', tourId: text };
  return { kind: 'describe', description: text };
}

function git(args, cwd) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function lines(output) {
  return output.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Files changed on this branch relative to the base branch, plus anything
// uncommitted or untracked. On the base branch itself (nothing ahead of it)
// only the working tree counts. Never throws — outside a repo it's [].
export function listChangedFiles(cwd = process.cwd()) {
  const files = new Set();
  try {
    let base;
    for (const candidate of ['origin/main', 'main', 'origin/master', 'master']) {
      try {
        base = lines(git(['merge-base', 'HEAD', candidate], cwd))[0];
        if (base) break;
      } catch {
        // try next candidate
      }
    }
    if (base) lines(git(['diff', '--name-only', '--relative', '--diff-filter=d', `${base}...HEAD`], cwd)).forEach((f) => files.add(f));
    lines(git(['diff', '--name-only', '--relative', '--diff-filter=d', 'HEAD'], cwd)).forEach((f) => files.add(f));
    lines(git(['ls-files', '--others', '--exclude-standard'], cwd)).forEach((f) => files.add(f));
  } catch {
    return [];
  }
  return [...files].sort();
}

// A tour that fails to load still owns its code_paths. Pull them out with a
// forgiving line scan (never a YAML parse, which is what failed) so a typo in
// one tour doesn't turn its files into a bogus "uncovered feature".
export function extractCodePathsLeniently(text) {
  const out = [];
  let inBlock = false;
  for (const line of String(text).split('\n')) {
    if (/^code_paths\s*:/.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    const item = line.match(/^\s+-\s+["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
    if (item) out.push(item[1]);
    else if (/^\S/.test(line)) break;
  }
  return out;
}

export const KNOWN_MODES = ['propose', 'map', 'prune', 'product', 'validate', 'status', 'init-site'];

export function parseTriageArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--description') args.description = argv[++i];
    else if (argv[i] === '--args') args.args = argv[++i];
  }
  return args;
}

// Everything triage.mjs prints, as data. A malformed tour never blocks the
// run (validate.mjs is what reports it): it's listed under `skippedTours` and
// simply doesn't count as coverage.
export function buildTriageReport({ cwd = process.cwd(), rawArgs, description }) {
  const toursDir = path.join(cwd, 'tours');
  const allFiles = fs.existsSync(toursDir) ? fs.readdirSync(toursDir).filter((f) => f.endsWith('.yaml')) : [];
  const tourIds = [];
  const skippedTours = [];
  const lenientTours = [];
  for (const file of allFiles) {
    const id = file.replace(/\.yaml$/, '');
    if (!SLUG_RE.test(id)) {
      skippedTours.push({ tourId: id, error: 'filename is not a lowercase kebab-case slug' });
      continue;
    }
    tourIds.push(id);
  }

  const out = {};
  if (rawArgs !== undefined) out.route = routeArguments(rawArgs, { knownModes: KNOWN_MODES, tourIds });
  if (description !== undefined) out.suggestedSlug = slugifyDescription(description, tourIds);

  if (rawArgs === undefined || out.route.kind === 'pipeline') {
    const tours = [];
    for (const id of tourIds) {
      try {
        tours.push(loadTour(toursDir, id));
      } catch (err) {
        skippedTours.push({ tourId: id, error: err.message });
        let text = '';
        try {
          text = fs.readFileSync(path.join(toursDir, `${id}.yaml`), 'utf8');
        } catch {
          // unreadable — contributes no coverage
        }
        const status = text.match(/^status\s*:\s*["']?(\w+)/m)?.[1] ?? 'confirmed';
        lenientTours.push({ id, status, code_paths: extractCodePathsLeniently(text) });
      }
    }
    const changedFiles = listChangedFiles(cwd);
    out.changedFiles = changedFiles;
    Object.assign(out, classifyChangedFiles({ changedFiles, tours: [...tours, ...lenientTours], cwd }));
    if (skippedTours.length > 0) {
      out.skippedTours = skippedTours;
      out.note =
        'Some tours failed to load strictly (their code_paths were still counted as coverage) — run validate.mjs to see why.';
    }
  }
  return out;
}
