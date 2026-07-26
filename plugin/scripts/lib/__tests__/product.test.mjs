import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PRODUCT_PAGES,
  PRODUCT_PAGE_IDS,
  PRODUCT_STATE_KEY,
  buildFrontmatter,
  buildSidebarStructure,
  collectProductSources,
  computeProductInputsHash,
  computeTourSidebarPositions,
  getProductDirtyReasons,
  isProductDirty,
  isProductRenderOnlyDirty,
  isPublishedTour,
  listGitTags,
  renderProductPage,
  resolveChangelogGitTags,
  resolveTourLinks,
} from '../product.mjs';

const tmpDirs = [];
function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-product-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function initGitRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}
function commitAll(dir, message) {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir });
}

describe('PRODUCT_PAGES / PRODUCT_PAGE_IDS / PRODUCT_STATE_KEY', () => {
  it('has exactly overview, getting-started, concepts, configuration, troubleshooting, changelog, in that order', () => {
    expect(PRODUCT_PAGE_IDS).toEqual([
      'overview',
      'getting-started',
      'concepts',
      'configuration',
      'troubleshooting',
      'changelog',
    ]);
  });

  it('only overview includes the tour index', () => {
    expect(PRODUCT_PAGES.find((p) => p.id === 'overview').includeTourIndex).toBe(true);
    expect(PRODUCT_PAGES.filter((p) => p.id !== 'overview').every((p) => !p.includeTourIndex)).toBe(true);
  });

  it('sidebar positions sort before the tour base (10)', () => {
    for (const page of PRODUCT_PAGES) {
      expect(page.sidebarPosition).toBeLessThan(10);
    }
  });

  it('reserves a state key no real tour id can ever collide with', () => {
    // tours.mjs's SLUG_RE requires a leading lowercase letter/digit.
    expect(PRODUCT_STATE_KEY.startsWith('_')).toBe(true);
  });
});

describe('collectProductSources', () => {
  it('includes only the standing sources that actually exist', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'README.md'), '# Hi');
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    // No .env.example, no autodocs.config.yaml, no CHANGELOG.md.
    expect(collectProductSources(dir, {})).toEqual(['README.md', 'package.json']);
  });

  it('includes CHANGELOG.md when it exists — the changelog page\'s preferred ground truth', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n- Initial release');
    expect(collectProductSources(dir, {})).toEqual(['CHANGELOG.md']);
  });

  it('adds files matched by config.product.sources globs', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'docs-src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs-src', 'a.md'), 'a');
    fs.writeFileSync(path.join(dir, 'docs-src', 'b.md'), 'b');
    const config = { product: { sources: ['docs-src/**/*.md'] } };
    expect(collectProductSources(dir, config)).toEqual(['docs-src/a.md', 'docs-src/b.md']);
  });

  it('never includes .env, even if a glob would match it', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
    const config = { product: { sources: ['.env'] } };
    expect(collectProductSources(dir, config)).toEqual([]);
  });

  it('does include .env.example (it is a standing source, not denied)', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, '.env.example'), 'SECRET=');
    expect(collectProductSources(dir, {})).toEqual(['.env.example']);
  });

  it('never includes key/cert-shaped files matched by a glob', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'secrets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'secrets', 'server.pem'), 'x');
    fs.writeFileSync(path.join(dir, 'secrets', 'server.key'), 'x');
    fs.writeFileSync(path.join(dir, 'secrets', 'notes.md'), 'x');
    const config = { product: { sources: ['secrets/**'] } };
    expect(collectProductSources(dir, config)).toEqual(['secrets/notes.md']);
  });

  it('never includes anything under a .auth/ directory', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, '.autodocs', 'artifacts', '.auth'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.autodocs', 'artifacts', '.auth', 'session.json'), '{}');
    const config = { product: { sources: ['.autodocs/artifacts/.auth/**'] } };
    expect(collectProductSources(dir, config)).toEqual([]);
  });

  it('ignores node_modules and .git even under a broad glob', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'index.md'), 'x');
    fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'real', 'notes.md'), 'x');
    const config = { product: { sources: ['**/*.md'] } };
    expect(collectProductSources(dir, config)).toEqual(['real/notes.md']);
  });

  it('never includes the .env.* family (.env.local, .env.production.local, ...), only .env.example', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, '.env.local'), 'SECRET=1');
    fs.writeFileSync(path.join(dir, '.env.production.local'), 'SECRET=2');
    fs.writeFileSync(path.join(dir, '.env.example'), 'SECRET=');
    const config = { product: { sources: ['.env.local', '.env.production.local', '.env.example'] } };
    expect(collectProductSources(dir, config)).toEqual(['.env.example']);
  });

  it('never includes a denied file nested under a subdirectory (checked by basename, not full path)', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'nested', '.env.local'), 'SECRET=1');
    const config = { product: { sources: ['nested/.env.local'] } };
    expect(collectProductSources(dir, config)).toEqual([]);
  });

  it('excludes brace-expansion patterns entirely (glob resolves them with nobrace, so they match nothing)', () => {
    // Config validation (lib/config.mjs's assertSafeSourceGlob) already
    // rejects "{"/"}" outright, but this pins the defense-in-depth behavior
    // here too, in case a caller ever constructs a config object directly
    // (bypassing loadConfig) the way this unit test does.
    const dir = makeTmpDir();
    const outsideDir = makeTmpDir();
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'TOP SECRET');
    // Regression guard for the confirmed bypass: a literal ".." segment
    // check alone lets "{..,x}/*secret*" through, since neither split
    // segment ("{..,x}" or "*secret*") is literally ".." — only glob's own
    // brace expansion turns it into a real "../*secret*" match. `nobrace`
    // must prevent that expansion from ever happening.
    const config = { product: { sources: [`{${path.relative(dir, outsideDir)},x}/*secret*`] } };
    expect(collectProductSources(dir, config)).toEqual([]);
  });

  it('excludes a symlink whose target resolves outside the project root, even with an innocent-looking in-repo path', () => {
    const dir = makeTmpDir();
    const outsideDir = makeTmpDir();
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'TOP SECRET OUTSIDE');
    fs.mkdirSync(path.join(dir, 'docs-src'), { recursive: true });
    fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(dir, 'docs-src', 'notes.md'));
    const config = { product: { sources: ['docs-src/**/*.md'] } };
    expect(collectProductSources(dir, config)).toEqual([]);
  });

  it('excludes a symlinked standing source (e.g. README.md committed as a symlink to something outside)', () => {
    const dir = makeTmpDir();
    const outsideDir = makeTmpDir();
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'TOP SECRET OUTSIDE');
    fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(dir, 'README.md'));
    expect(collectProductSources(dir, {})).toEqual([]);
  });

  it('still includes a normal file at the project root (confinement check does not reject legitimate files)', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'README.md'), '# Hi');
    expect(collectProductSources(dir, {})).toEqual(['README.md']);
  });

  it('deduplicates and sorts the final list', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'README.md'), '# Hi');
    const config = { product: { sources: ['README.md', '*.md'] } };
    expect(collectProductSources(dir, config)).toEqual(['README.md']);
  });
});

describe('computeProductInputsHash', () => {
  it('is stable for the same sources and tour inventory', () => {
    const dir = makeTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'README.md'), 'v1');
    commitAll(dir, 'initial');
    const tours = [{ id: 'login', title: 'Login', intent: 'x', status: 'confirmed', maturity: 'stable' }];

    const a = computeProductInputsHash({ cwd: dir, sourceFiles: ['README.md'], tours });
    const b = computeProductInputsHash({ cwd: dir, sourceFiles: ['README.md'], tours });
    expect(a).toBe(b);
  });

  it('changes when a source file changes', () => {
    const dir = makeTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'README.md'), 'v1');
    commitAll(dir, 'initial');
    const before = computeProductInputsHash({ cwd: dir, sourceFiles: ['README.md'], tours: [] });

    fs.writeFileSync(path.join(dir, 'README.md'), 'v2');
    commitAll(dir, 'update');
    const after = computeProductInputsHash({ cwd: dir, sourceFiles: ['README.md'], tours: [] });

    expect(after).not.toBe(before);
  });

  it('changes when a tour is added to the inventory', () => {
    const dir = makeTmpDir();
    const before = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [] });
    const after = computeProductInputsHash({
      cwd: dir,
      sourceFiles: [],
      tours: [{ id: 'login', status: 'confirmed', maturity: 'stable' }],
    });
    expect(after).not.toBe(before);
  });

  it('changes when a tour is archived (status changes) even if the set of ids is the same', () => {
    const dir = makeTmpDir();
    const before = computeProductInputsHash({
      cwd: dir,
      sourceFiles: [],
      tours: [{ id: 'login', status: 'confirmed', maturity: 'stable' }],
    });
    const after = computeProductInputsHash({
      cwd: dir,
      sourceFiles: [],
      tours: [{ id: 'login', status: 'archived', maturity: 'stable' }],
    });
    expect(after).not.toBe(before);
  });

  it('is independent of tour array order', () => {
    const dir = makeTmpDir();
    const a = computeProductInputsHash({
      cwd: dir,
      sourceFiles: [],
      tours: [{ id: 'a', status: 'confirmed' }, { id: 'b', status: 'confirmed' }],
    });
    const b = computeProductInputsHash({
      cwd: dir,
      sourceFiles: [],
      tours: [{ id: 'b', status: 'confirmed' }, { id: 'a', status: 'confirmed' }],
    });
    expect(a).toBe(b);
  });

  it('omits gitTags entirely from the hash input when not given (back-compat)', () => {
    const dir = makeTmpDir();
    const withUndefined = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [] });
    const withExplicitUndefined = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [], gitTags: undefined });
    expect(withUndefined).toBe(withExplicitUndefined);
  });

  it('changes when gitTags differs, even with identical sources/tours', () => {
    const dir = makeTmpDir();
    const before = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [], gitTags: ['v1.0.0'] });
    const after = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [], gitTags: ['v1.0.0', 'v1.1.0'] });
    expect(after).not.toBe(before);
  });

  it('is independent of gitTags order (same set, different order, is a real change here — order carries meaning: newest first)', () => {
    // Unlike tours (explicitly sorted before hashing), tag order from
    // listGitTags is meaningful (newest-created first) and deliberately not
    // normalized here — a real reordering (e.g. a backdated tag) is a real
    // change worth marking dirty.
    const dir = makeTmpDir();
    const a = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [], gitTags: ['v1.1.0', 'v1.0.0'] });
    const b = computeProductInputsHash({ cwd: dir, sourceFiles: [], tours: [], gitTags: ['v1.0.0', 'v1.1.0'] });
    expect(a).not.toBe(b);
  });
});

describe('listGitTags', () => {
  it('returns tags newest-created first', () => {
    // --sort=-creatordate falls back to a lightweight tag's *commit* date —
    // two commits made back-to-back in a test can land in the same
    // second (git's commit-date resolution), making sort order ambiguous.
    // Explicit, clearly-separated dates make this a real test of the sort
    // flag instead of a timing-dependent guess.
    const dir = makeTmpDir();
    initGitRepo(dir);
    const commitAt = (message, isoDate) => {
      fs.writeFileSync(path.join(dir, 'a.txt'), message);
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', message], {
        cwd: dir,
        env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
      });
    };
    commitAt('first', '2020-01-01T00:00:00Z');
    execFileSync('git', ['tag', 'v1.0.0'], { cwd: dir });
    commitAt('second', '2021-01-01T00:00:00Z');
    execFileSync('git', ['tag', 'v1.1.0'], { cwd: dir });
    expect(listGitTags(dir)).toEqual(['v1.1.0', 'v1.0.0']);
  });

  it('returns an empty array for a repo with no tags', () => {
    const dir = makeTmpDir();
    initGitRepo(dir);
    expect(listGitTags(dir)).toEqual([]);
  });

  it('returns an empty array outside a git repo, rather than throwing', () => {
    const dir = makeTmpDir();
    expect(listGitTags(dir)).toEqual([]);
  });
});

describe('resolveChangelogGitTags', () => {
  it('returns undefined when changelog is not among the enabled pages', () => {
    const dir = makeTmpDir();
    expect(resolveChangelogGitTags({ cwd: dir, enabledPageIds: ['overview'] })).toBeUndefined();
  });

  it('returns undefined when CHANGELOG.md exists, even if changelog is enabled', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog');
    expect(resolveChangelogGitTags({ cwd: dir, enabledPageIds: ['changelog'] })).toBeUndefined();
  });

  it('returns the tag list when changelog is enabled and there is no CHANGELOG.md', () => {
    const dir = makeTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(dir + '/a.txt', 'a');
    commitAll(dir, 'first');
    execFileSync('git', ['tag', 'v1.0.0'], { cwd: dir });
    expect(resolveChangelogGitTags({ cwd: dir, enabledPageIds: ['changelog'] })).toEqual(['v1.0.0']);
  });
});

describe('getProductDirtyReasons / isProductDirty / isProductRenderOnlyDirty', () => {
  it('is ["never-generated"] with no previous entry', () => {
    expect(
      getProductDirtyReasons({ previousEntry: undefined, currentInputsHash: 'a', currentRenderHash: 'b' }),
    ).toEqual(['never-generated']);
  });

  it('is clean when nothing changed', () => {
    const previousEntry = { inputsHash: 'a', renderHash: 'b' };
    expect(
      getProductDirtyReasons({ previousEntry, currentInputsHash: 'a', currentRenderHash: 'b' }),
    ).toEqual([]);
    expect(isProductDirty({ previousEntry, currentInputsHash: 'a', currentRenderHash: 'b' })).toBe(false);
  });

  it('reports "inputs" alone when only the inputs hash changed', () => {
    const previousEntry = { inputsHash: 'a', renderHash: 'b' };
    const reasons = getProductDirtyReasons({ previousEntry, currentInputsHash: 'a2', currentRenderHash: 'b' });
    expect(reasons).toEqual(['inputs']);
    expect(isProductRenderOnlyDirty(reasons)).toBe(false);
  });

  it('reports "render" alone when only the render hash changed, and flags it render-only', () => {
    const previousEntry = { inputsHash: 'a', renderHash: 'b' };
    const reasons = getProductDirtyReasons({ previousEntry, currentInputsHash: 'a', currentRenderHash: 'b2' });
    expect(reasons).toEqual(['render']);
    expect(isProductRenderOnlyDirty(reasons)).toBe(true);
  });

  it('reports both dimensions together, not render-only', () => {
    const previousEntry = { inputsHash: 'a', renderHash: 'b' };
    const reasons = getProductDirtyReasons({ previousEntry, currentInputsHash: 'a2', currentRenderHash: 'b2' });
    expect(reasons).toEqual(['inputs', 'render']);
    expect(isProductRenderOnlyDirty(reasons)).toBe(false);
  });

  it('never-generated is not render-only (there is no prose to reuse yet)', () => {
    expect(isProductRenderOnlyDirty(['never-generated'])).toBe(false);
  });
});

describe('buildFrontmatter', () => {
  it('emits only the keys given', () => {
    const fm = buildFrontmatter({ sidebarPosition: 1 });
    expect(fm).toContain('sidebar_position: 1');
    expect(fm).not.toContain('sidebar_label');
    expect(fm).not.toContain('title:');
  });

  it('JSON-quotes label/title values', () => {
    const fm = buildFrontmatter({ sidebarLabel: 'Dashboard (beta)', title: 'A "quoted" title' });
    expect(fm).toContain('sidebar_label: "Dashboard (beta)"');
    expect(fm).toContain('title: "A \\"quoted\\" title"');
  });

  it('wraps content in --- delimiters with a trailing blank separator', () => {
    const fm = buildFrontmatter({ sidebarPosition: 2 });
    expect(fm.startsWith('---\n')).toBe(true);
    expect(fm.endsWith('---\n')).toBe(true);
  });

  it('throws when sidebarPosition is not a finite number', () => {
    expect(() => buildFrontmatter({ sidebarPosition: 'first' })).toThrow(/finite number/);
    expect(() => buildFrontmatter({ sidebarPosition: NaN })).toThrow(/finite number/);
  });

  it('throws when sidebarLabel is an empty string', () => {
    expect(() => buildFrontmatter({ sidebarLabel: '   ' })).toThrow(/non-empty string/);
  });

  it('throws when title exceeds the length cap', () => {
    expect(() => buildFrontmatter({ title: 'x'.repeat(101) })).toThrow(/100 characters or fewer/);
  });

  it('accepts a tour-title-shaped label containing parentheses (not raw HTML, JSON-quoted safely)', () => {
    // A free-form tour title can reasonably contain punctuation that
    // lib/design.mjs's assertSafeLabel would reject (that check exists for a
    // different embedding context — see product.mjs's comment).
    expect(() => buildFrontmatter({ sidebarLabel: 'Export dashboard activity (CSV)' })).not.toThrow();
  });

  it('produces no frontmatter block content beyond the delimiters when nothing is passed', () => {
    const fm = buildFrontmatter();
    expect(fm).toBe('---\n---\n');
  });

  it('JSON-quotes an opt-in lastVerified value', () => {
    const fm = buildFrontmatter({ lastVerified: '2026-07-25 (a1b2c3d)' });
    expect(fm).toContain('last_verified: "2026-07-25 (a1b2c3d)"');
  });

  it('omits last_verified when lastVerified is not given (the default — no stampVerified opt-in)', () => {
    const fm = buildFrontmatter({ sidebarPosition: 1 });
    expect(fm).not.toContain('last_verified');
  });

  it('throws when lastVerified is an empty string', () => {
    expect(() => buildFrontmatter({ lastVerified: '' })).toThrow(/non-empty string/);
  });
});

describe('renderProductPage', () => {
  it('renders sections as ## headings with their body', () => {
    const page = renderProductPage({
      page: { title: 'Overview' },
      prose: { sections: [{ heading: 'What it is', body: 'It does things.' }] },
    });
    expect(page).toContain('# Overview');
    expect(page).toContain('## What it is');
    expect(page).toContain('It does things.');
  });

  it('includes a linked tour index when tourIndex is given', () => {
    const page = renderProductPage({
      page: { title: 'Overview' },
      prose: { sections: [] },
      tourIndex: [{ id: 'login', title: 'Login page', intent: 'Show the sign-in form.' }],
    });
    expect(page).toContain('## Tutorials');
    expect(page).toContain('- [Login page](login.md) — Show the sign-in form.');
  });

  it('omits the intent suffix when a tour has none', () => {
    const page = renderProductPage({
      page: { title: 'Overview' },
      prose: { sections: [] },
      tourIndex: [{ id: 'login', title: 'Login page' }],
    });
    expect(page).toContain('- [Login page](login.md)');
    expect(page).not.toContain('- [Login page](login.md) —');
  });

  it('omits the tour index section entirely when tourIndex is empty/undefined', () => {
    const page = renderProductPage({ page: { title: 'Getting started' }, prose: { sections: [] } });
    expect(page).not.toContain('## Tutorials');
  });

  it('always includes exactly one keep-region', () => {
    const page = renderProductPage({ page: { title: 'Concepts' }, prose: { sections: [] } });
    expect(page).toContain('<!-- autodocs:keep -->');
    expect(page).toContain('<!-- /autodocs:keep -->');
  });

  it('prepends frontmatter when given', () => {
    const fm = buildFrontmatter({ sidebarPosition: 1 });
    const page = renderProductPage({ page: { title: 'Overview' }, prose: { sections: [] }, frontmatter: fm });
    expect(page.startsWith('---\nsidebar_position: 1\n---\n')).toBe(true);
  });

  it('has no frontmatter block when none is given', () => {
    const page = renderProductPage({ page: { title: 'Overview' }, prose: { sections: [] } });
    expect(page.startsWith('# Overview')).toBe(true);
  });
});

describe('isPublishedTour', () => {
  it('is true for a plain confirmed/stable tour', () => {
    expect(isPublishedTour({ status: 'confirmed', maturity: 'stable' })).toBe(true);
  });

  it('is true when status/maturity are unset (implicit defaults)', () => {
    expect(isPublishedTour({})).toBe(true);
  });

  it('is false for a draft tour', () => {
    expect(isPublishedTour({ maturity: 'draft' })).toBe(false);
  });

  it('is false for a proposed tour', () => {
    expect(isPublishedTour({ status: 'proposed' })).toBe(false);
  });

  it('is false for an archived tour', () => {
    expect(isPublishedTour({ status: 'archived' })).toBe(false);
  });
});

describe('resolveTourLinks', () => {
  const login = { id: 'login', title: 'Login page' };
  const dashboard = { id: 'dashboard', title: 'Dashboard' };
  const draft = { id: 'wip', title: 'Work in progress', maturity: 'draft' };
  const proposed = { id: 'proposed-tour', title: 'Proposed', status: 'proposed' };
  const archived = { id: 'gone', title: 'Gone', status: 'archived' };
  const allTours = [login, dashboard, draft, proposed, archived];

  it('resolves ids to {id, title} pairs, in the order given', () => {
    expect(resolveTourLinks(['dashboard', 'login'], allTours)).toEqual([
      { id: 'dashboard', title: 'Dashboard' },
      { id: 'login', title: 'Login page' },
    ]);
  });

  it('drops a dangling id (no matching tour)', () => {
    expect(resolveTourLinks(['login', 'ghost'], allTours)).toEqual([{ id: 'login', title: 'Login page' }]);
  });

  it('drops a draft/proposed/archived tour, even though it exists', () => {
    expect(resolveTourLinks(['wip', 'proposed-tour', 'gone'], allTours)).toEqual([]);
  });

  it('falls back to the id when a resolved tour has no title', () => {
    expect(resolveTourLinks(['untitled'], [{ id: 'untitled' }])).toEqual([{ id: 'untitled', title: 'untitled' }]);
  });

  it('returns an empty array for undefined/empty ids', () => {
    expect(resolveTourLinks(undefined, allTours)).toEqual([]);
    expect(resolveTourLinks([], allTours)).toEqual([]);
  });
});

describe('buildSidebarStructure', () => {
  const tours = [
    { id: 'login', status: 'confirmed', maturity: 'stable' },
    { id: 'dashboard-overview', status: 'confirmed', maturity: 'stable' },
    { id: 'dashboard-export', status: 'confirmed', maturity: 'stable' },
    { id: 'draft-feature', maturity: 'draft' },
    { id: 'proposed-feature', status: 'proposed' },
    { id: 'removed-feature', status: 'archived' },
  ];

  it('lists product pages in the given order', () => {
    const structure = buildSidebarStructure({ pages: PRODUCT_PAGES, sections: undefined, tours: [] });
    expect(structure.productPages).toEqual([
      'overview',
      'getting-started',
      'concepts',
      'configuration',
      'troubleshooting',
      'changelog',
    ]);
  });

  it('groups tours into configured sections, in order', () => {
    const sections = [{ label: 'Getting started', tours: ['login'] }];
    const structure = buildSidebarStructure({ pages: [], sections, tours });
    expect(structure.sections).toEqual([{ label: 'Getting started', tours: ['login'] }]);
  });

  it('puts every unsectioned published tour into unsectionedTours, sorted', () => {
    const sections = [{ label: 'Getting started', tours: ['login'] }];
    const structure = buildSidebarStructure({ pages: [], sections, tours });
    expect(structure.unsectionedTours).toEqual(['dashboard-export', 'dashboard-overview']);
  });

  it('excludes draft/proposed/archived tours from both sections and unsectionedTours', () => {
    const sections = [{ label: 'Everything', tours: ['login', 'draft-feature', 'proposed-feature', 'removed-feature'] }];
    const structure = buildSidebarStructure({ pages: [], sections, tours });
    expect(structure.sections[0].tours).toEqual(['login']);
    expect(structure.unsectionedTours).not.toContain('draft-feature');
    expect(structure.unsectionedTours).not.toContain('proposed-feature');
    expect(structure.unsectionedTours).not.toContain('removed-feature');
  });

  it('with no sections configured, every published tour is unsectioned, sorted alphabetically', () => {
    const structure = buildSidebarStructure({ pages: [], sections: undefined, tours });
    expect(structure.unsectionedTours).toEqual(['dashboard-export', 'dashboard-overview', 'login']);
    expect(structure.sections).toEqual([]);
  });
});

describe('computeTourSidebarPositions', () => {
  const tours = [
    { id: 'login', status: 'confirmed' },
    { id: 'dashboard-overview', status: 'confirmed' },
    { id: 'dashboard-export', status: 'confirmed' },
    { id: 'draft-feature', maturity: 'draft' },
  ];

  it('starts at 10 and follows docs.sections order first, then alphabetical for the rest', () => {
    const sections = [{ label: 'Getting started', tours: ['login'] }];
    const positions = computeTourSidebarPositions({ sections, tours });
    expect(positions.get('login')).toBe(10);
    expect(positions.get('dashboard-export')).toBe(11);
    expect(positions.get('dashboard-overview')).toBe(12);
  });

  it('falls back to pure alphabetical order with no sections configured', () => {
    const positions = computeTourSidebarPositions({ sections: undefined, tours });
    expect(positions.get('dashboard-export')).toBe(10);
    expect(positions.get('dashboard-overview')).toBe(11);
    expect(positions.get('login')).toBe(12);
  });

  it('assigns no position to a draft tour', () => {
    const positions = computeTourSidebarPositions({ sections: undefined, tours });
    expect(positions.has('draft-feature')).toBe(false);
  });
});
