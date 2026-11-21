import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractApiHints, findApiSpecFiles, loadApiHints, markCoverage } from '../api-spec.mjs';

const dirs = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-api-'));
  dirs.push(d);
  return d;
};

const spec = {
  paths: {
    '/api/v1/orders': { get: { tags: ['Orders'], summary: 'List orders' }, post: { tags: ['Orders'] } },
    '/api/v1/orders/{id}': { delete: { tags: ['Orders'], deprecated: true } },
    '/api/v1/exports': { get: { summary: 'Export CSV' } },
    '/internal/cron': { post: { tags: ['Cron'], 'x-internal': true } },
  },
  webhooks: { evt: { post: { tags: ['Hooks'] } } },
};

describe('extractApiHints', () => {
  it('groups by tag, falls back to the path, skips deprecated/internal/webhooks', () => {
    const hints = extractApiHints(spec);
    expect(hints.map((h) => h.feature).sort()).toEqual(['Orders', 'exports']);
    const orders = hints.find((h) => h.feature === 'Orders');
    expect(orders.operationCount).toBe(2);
    expect(orders.operations[0]).toMatchObject({ method: 'GET', path: '/api/v1/orders', summary: 'List orders' });
  });
  it('tolerates junk', () => {
    expect(extractApiHints(null)).toEqual([]);
    expect(extractApiHints({ paths: 'x' })).toEqual([]);
    expect(extractApiHints({ paths: { '/a': null } })).toEqual([]);
  });
});

describe('markCoverage', () => {
  it('matches tour ids/titles tolerant of plurals', () => {
    const out = markCoverage([{ feature: 'Orders' }, { feature: 'Billing' }], [{ id: 'order-history', title: 'Order history' }]);
    expect(out.map((h) => h.coveredByTour)).toEqual([true, false]);
  });
});

describe('loadApiHints', () => {
  it('finds a JSON spec, parses YAML too, and reports a malformed one', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'openapi.json'), JSON.stringify(spec));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'swagger.yaml'), 'paths:\n  /billing:\n    get:\n      summary: Plan\n');
    fs.mkdirSync(path.join(dir, 'api'));
    fs.writeFileSync(path.join(dir, 'api', 'openapi.yml'), 'paths: [unclosed');
    expect(findApiSpecFiles(dir).sort()).toEqual(['api/openapi.yml', 'docs/swagger.yaml', 'openapi.json']);
    const result = loadApiHints({ cwd: dir, tours: [] });
    expect(result.hints.map((h) => h.feature).sort()).toEqual(['Orders', 'billing', 'exports']);
    expect(result.errors).toHaveLength(1);
  });
  it('returns nothing when there is no spec', () => {
    expect(loadApiHints({ cwd: tmp() })).toEqual({ files: [], hints: [] });
  });
});
