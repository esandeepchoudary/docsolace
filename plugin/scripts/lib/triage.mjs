// Mechanical triage for a bare `/document` run: given the files a branch
// changed, which existing tours do they belong to (resync those), and which
// UI-looking files belong to no tour at all (a candidate new tutorial)?
//
// Deliberately file-based, never a guess at "what the feature is" — naming
// and describing a feature is the human's (or tour-scout's) job. This only
// answers "did anything change that a tour already covers, or that no tour
// covers", the same mechanical posture as drift.mjs's resolveChangedCodePaths.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolveCodePathFiles } from './drift.mjs';
import { SLUG_RE } from './tours.mjs';

// Source files that plausibly render UI. Anything else (config, lockfiles,
// markdown, images, test files) never counts toward "uncovered".
const UI_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.html',
  '.css', '.scss', '.sass', '.less', '.erb', '.ejs', '.hbs', '.njk', '.php',
]);

const IGNORED_PREFIXES = [
  'node_modules/', 'dist/', 'build/', '.next/', '.docsolace/', 'tours/', 'docs/', 'site/',
  'fixtures/', 'scripts/', '.github/', 'test/', 'tests/', '__tests__/',
];

const TEST_FILE_RE = /(?:\.|-)(?:test|spec|stories)\.[a-z]+$|(?:^|\/)__tests__\//;
const CONFIG_FILE_RE = /(?:^|\/)[^/]*\.config\.[a-z]+$/;

export function isUiFile(file) {
  const normalized = file.replace(/\\/g, '/');
  if (IGNORED_PREFIXES.some((p) => normalized.startsWith(p))) return false;
  if (TEST_FILE_RE.test(normalized) || CONFIG_FILE_RE.test(normalized)) return false;
  return UI_EXTENSIONS.has(path.extname(normalized).toLowerCase());
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
    const owned = new Set(resolveCodePathFiles(tour.code_paths ?? [], cwd));
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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  let slug = (meaningful.length > 0 ? meaningful : words).join('-').slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
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
// tours. Anything left over is a free-text feature description.
export function routeArguments(argString, { knownModes, tourIds }) {
  const text = String(argString ?? '')
    .replace(/--(?:review|no-style)\b/g, '')
    .trim();
  if (text === '') return { kind: 'pipeline' };
  const first = text.split(/\s+/)[0];
  if (knownModes.includes(first)) return { kind: 'mode', mode: first };
  if (tourIds.includes(text)) return { kind: 'tour', tourId: text };
  return { kind: 'describe', description: text };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
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
    if (base) lines(git(['diff', '--name-only', `${base}...HEAD`], cwd)).forEach((f) => files.add(f));
    lines(git(['diff', '--name-only', 'HEAD'], cwd)).forEach((f) => files.add(f));
    lines(git(['ls-files', '--others', '--exclude-standard'], cwd)).forEach((f) => files.add(f));
  } catch {
    return [];
  }
  return [...files].sort();
}
