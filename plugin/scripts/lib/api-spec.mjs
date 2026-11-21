// Optional hint source for `/document map`: if the project ships an OpenAPI /
// Swagger spec, its tags group endpoints into features (orders, billing,
// exports...). Those are *hints only* — a spec describes the backend, and
// plenty of endpoints (webhooks, internal, cron) have no screen. Each hint is
// something for the map's code-review/tour-scout steps to try to find in the
// real app; one that can't be grounded there is reported, never documented.
//
// Local files only (a spec's URLs are never fetched), size-capped, and parsed
// as data: nothing in it is executed or followed.
import fs from 'node:fs';
import path from 'node:path';
import { JSON_SCHEMA, load as parseYaml } from 'js-yaml';

const SPEC_NAMES = ['openapi', 'swagger'];
const SPEC_DIRS = ['', 'docs', 'doc', 'api', 'spec', 'specs'];
const SPEC_EXTS = ['.json', '.yaml', '.yml'];
const MAX_SPEC_BYTES = 2 * 1024 * 1024;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export function findApiSpecFiles(cwd = process.cwd()) {
  const found = [];
  for (const dir of SPEC_DIRS) {
    for (const name of SPEC_NAMES) {
      for (const ext of SPEC_EXTS) {
        const file = path.join(dir, `${name}${ext}`);
        try {
          const stat = fs.statSync(path.join(cwd, file));
          if (stat.isFile() && stat.size <= MAX_SPEC_BYTES) found.push(file);
        } catch {
          // not there
        }
      }
    }
  }
  return found;
}

function tagFromPath(route) {
  // /api/v1/orders/{id}/items -> orders
  const parts = route.split('/').filter((p) => p && !p.startsWith('{') && !/^(api|v\d+)$/i.test(p));
  return parts[0] ?? null;
}

// Groups a parsed spec's operations by tag. Skips deprecated operations and
// anything marked internal (`x-internal`, `x-hidden`); `webhooks` aren't
// read at all, since they're never a screen.
export function extractApiHints(spec) {
  if (!spec || typeof spec !== 'object' || typeof spec.paths !== 'object' || spec.paths === null) return [];
  const groups = new Map();
  for (const [route, item] of Object.entries(spec.paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || typeof op !== 'object') continue;
      if (op.deprecated || op['x-internal'] || op['x-hidden']) continue;
      const tag = (Array.isArray(op.tags) && op.tags[0]) || tagFromPath(route);
      if (!tag) continue;
      const key = String(tag).trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { feature: String(tag).trim(), operations: [] });
      groups.get(key).operations.push({
        method: method.toUpperCase(),
        path: route,
        ...(typeof op.summary === 'string' ? { summary: op.summary.slice(0, 120) } : {}),
      });
    }
  }
  return [...groups.values()].map((g) => ({ ...g, operations: g.operations.slice(0, 10), operationCount: g.operations.length }));
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// A hint is "uncovered" when no tour id or title mentions its feature name
// (singular/plural tolerated). Mechanical string match — the map step still
// decides whether a real screen exists.
export function markCoverage(hints, tours) {
  const haystack = tours.map((t) => `${norm(t.id)} ${norm(t.title ?? '')}`);
  return hints.map((h) => {
    const name = norm(h.feature);
    const stem = name.replace(/s$/, '');
    const covered = stem.length > 0 && haystack.some((text) => text.includes(stem));
    return { ...h, coveredByTour: covered };
  });
}

export function loadApiHints({ cwd = process.cwd(), tours = [] } = {}) {
  const files = findApiSpecFiles(cwd);
  const hints = [];
  const errors = [];
  for (const file of files) {
    try {
      const text = fs.readFileSync(path.join(cwd, file), 'utf8');
      const spec = file.endsWith('.json') ? JSON.parse(text) : parseYaml(text, { schema: JSON_SCHEMA });
      for (const h of extractApiHints(spec)) hints.push({ ...h, source: file });
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  }
  return { files, hints: markCoverage(hints, tours), ...(errors.length ? { errors } : {}) };
}
