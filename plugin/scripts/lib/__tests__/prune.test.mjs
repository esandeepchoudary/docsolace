import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findOrphanTours, isStrongOrphanSignal, resolveTourRoutes } from '../prune.mjs';

const tmpDirs = [];

function mkTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-prune-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('resolveTourRoutes', () => {
  it('extracts goto paths in step order, ignoring other actions/captures', () => {
    const tour = {
      steps: [
        { action: 'goto', path: '/dashboard' },
        { capture: 'full', description: 'x' },
        { action: 'click', selector: "role=button[name='Filters']" },
        { action: 'goto', path: '/dashboard/settings' },
      ],
    };
    expect(resolveTourRoutes(tour)).toEqual(['/dashboard', '/dashboard/settings']);
  });

  it('returns an empty array when there are no steps', () => {
    expect(resolveTourRoutes({ steps: [] })).toEqual([]);
    expect(resolveTourRoutes({})).toEqual([]);
  });
});

describe('findOrphanTours', () => {
  function tour(overrides) {
    return {
      id: 'dashboard-export',
      maturity: 'stable',
      status: 'confirmed',
      code_paths: ['Dashboard.jsx'],
      steps: [{ action: 'goto', path: '/dashboard' }],
      ...overrides,
    };
  }

  it('flags a tour as code-removed when code_paths used to resolve but now matches nothing', () => {
    const dir = mkTmpDir(); // no Dashboard.jsx written — glob resolves empty
    const state = { 'dashboard-export': { screenshotHashes: {}, codePathsHash: 'x' } };
    const orphans = findOrphanTours({ tours: [tour()], state, cwd: dir });
    expect(orphans).toEqual([{ tourId: 'dashboard-export', reasons: ['code-removed'] }]);
  });

  it('does not flag a tour whose code_paths still resolve to real files', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    expect(findOrphanTours({ tours: [tour()], state, cwd: dir })).toEqual([]);
  });

  it('never flags a tour that has not been generated yet (no previous state entry)', () => {
    const dir = mkTmpDir(); // code_paths would resolve empty, but it never ran before
    expect(findOrphanTours({ tours: [tour()], state: {}, cwd: dir })).toEqual([]);
  });

  it('skips draft tours entirely', () => {
    const dir = mkTmpDir();
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    expect(findOrphanTours({ tours: [tour({ maturity: 'draft' })], state, cwd: dir })).toEqual([]);
  });

  it('skips proposed tours entirely', () => {
    const dir = mkTmpDir();
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    expect(findOrphanTours({ tours: [tour({ status: 'proposed' })], state, cwd: dir })).toEqual([]);
  });

  it('skips already-archived tours entirely (nothing left to re-flag)', () => {
    const dir = mkTmpDir();
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    expect(findOrphanTours({ tours: [tour({ status: 'archived' })], state, cwd: dir })).toEqual([]);
  });

  it('does not check routes at all when neither siteMap nor sourceRoutes is passed', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x'); // code_paths fine
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    // Route is nowhere, but since neither input was given, route-unreachable
    // must never fire.
    expect(findOrphanTours({ tours: [tour()], state, cwd: dir })).toEqual([]);
  });

  it('flags route-unreachable when the tour\'s goto path appears in neither siteMap nor sourceRoutes', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [tour()],
      state,
      siteMap: [{ route: '/login' }, { route: '/settings' }],
      sourceRoutes: ['/login'],
      cwd: dir,
    });
    expect(orphans).toEqual([{ tourId: 'dashboard-export', reasons: ['route-unreachable'] }]);
  });

  it('does not flag route-unreachable when the route is found in siteMap even if absent from sourceRoutes', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [tour()],
      state,
      siteMap: [{ route: '/dashboard' }],
      sourceRoutes: [],
      cwd: dir,
    });
    expect(orphans).toEqual([]);
  });

  it('does not flag route-unreachable when the route is found in sourceRoutes even if absent from siteMap', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [tour()],
      state,
      siteMap: [],
      sourceRoutes: ['/dashboard'],
      cwd: dir,
    });
    expect(orphans).toEqual([]);
  });

  it('reports both reasons together when a tour is both code-removed and route-unreachable', () => {
    const dir = mkTmpDir();
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [tour()],
      state,
      siteMap: [{ route: '/login' }],
      sourceRoutes: [],
      cwd: dir,
    });
    expect(orphans).toEqual([{ tourId: 'dashboard-export', reasons: ['code-removed', 'route-unreachable'] }]);
  });

  it('reports route-unreachable on its own when code_paths is fine but no route matches — regression guard for a stale/partial site-map.json', () => {
    // A site-map.json can legitimately be incomplete (bounded crawl, a
    // skipped auth profile, or simply an old file left from an earlier,
    // narrower run) — this must never be silently treated as equivalent to
    // code-removed; isStrongOrphanSignal is what keeps callers from
    // auto-archiving on this alone (see the "weak evidence" tests below).
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [tour()],
      state,
      siteMap: [{ route: '/login' }],
      cwd: dir,
    });
    expect(orphans).toEqual([{ tourId: 'dashboard-export', reasons: ['route-unreachable'] }]);
  });

  it('never flags a tour with no goto steps as route-unreachable (nothing to check)', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [tour({ steps: [{ capture: 'x', description: 'y' }] })],
      state,
      siteMap: [],
      cwd: dir,
    });
    expect(orphans).toEqual([]);
  });

  it('flags route-unreachable for a multi-goto tour when only ONE of its routes is missing — regression guard for the old .every() threshold', () => {
    // A checkout-style tour that visits /cart then /checkout: /cart is
    // still reachable, but /checkout (the actual feature) isn't in the
    // crawl/code-review data anymore. The old `.every()` check required
    // *all* routes to be missing before flagging anything, so a tour like
    // this would slip through undetected — .some() is what this guards.
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [
        tour({
          steps: [
            { action: 'goto', path: '/cart' },
            { action: 'goto', path: '/checkout' },
          ],
        }),
      ],
      state,
      siteMap: [{ route: '/cart' }], // /checkout is nowhere in here
      cwd: dir,
    });
    expect(orphans).toEqual([{ tourId: 'dashboard-export', reasons: ['route-unreachable'] }]);
  });

  it('does not flag route-unreachable for a multi-goto tour when every route is still found', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    const orphans = findOrphanTours({
      tours: [
        tour({
          steps: [
            { action: 'goto', path: '/cart' },
            { action: 'goto', path: '/checkout' },
          ],
        }),
      ],
      state,
      siteMap: [{ route: '/cart' }, { route: '/checkout' }],
      cwd: dir,
    });
    expect(orphans).toEqual([]);
  });

  it('throws a clear error instead of a raw TypeError when siteMap is not an array', () => {
    const dir = mkTmpDir();
    expect(() =>
      findOrphanTours({ tours: [tour()], state: {}, siteMap: { pages: [] }, cwd: dir }),
    ).toThrow(/siteMap must be an array/);
  });

  it('throws a clear error instead of a raw TypeError when sourceRoutes is not an array', () => {
    const dir = mkTmpDir();
    expect(() =>
      findOrphanTours({ tours: [tour()], state: {}, sourceRoutes: '/dashboard', cwd: dir }),
    ).toThrow(/sourceRoutes must be an array/);
  });

  it('still works fine when siteMap/sourceRoutes are omitted entirely (no route check, no throw)', () => {
    const dir = mkTmpDir();
    fs.writeFileSync(path.join(dir, 'Dashboard.jsx'), 'x');
    const state = { 'dashboard-export': { codePathsHash: 'x' } };
    expect(() => findOrphanTours({ tours: [tour()], state, cwd: dir })).not.toThrow();
    expect(findOrphanTours({ tours: [tour()], state, cwd: dir })).toEqual([]);
  });
});

describe('isStrongOrphanSignal', () => {
  it('is true when code-removed is among the reasons, alone or combined', () => {
    expect(isStrongOrphanSignal(['code-removed'])).toBe(true);
    expect(isStrongOrphanSignal(['code-removed', 'route-unreachable'])).toBe(true);
  });

  it('is false for route-unreachable alone — crawl coverage is best-effort, not proof', () => {
    expect(isStrongOrphanSignal(['route-unreachable'])).toBe(false);
  });

  it('is false for an empty reasons list', () => {
    expect(isStrongOrphanSignal([])).toBe(false);
  });
});
