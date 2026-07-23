import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { renderDraftTour } from '../tour-scaffold.mjs';
import { loadTour } from '../tours.mjs';

const tmpDirs = [];
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

const BASE = {
  id: 'dashboard-export',
  title: 'Export dashboard data',
  intent: 'Show how to export the activity table as a CSV.',
  codePaths: ['demo-app/src/pages/Dashboard.jsx'],
  steps: [
    { action: 'goto', path: '/dashboard' },
    { capture: 'export-button', description: 'Export button visible' },
    { action: 'click', selector: "role=button[name='Export CSV']" },
    { capture: 'export-triggered', description: 'Export in progress' },
  ],
};

describe('renderDraftTour', () => {
  it('always marks the tour maturity: draft and status: proposed', () => {
    const yaml = renderDraftTour(BASE);
    const parsed = parseYaml(yaml);
    expect(parsed.maturity).toBe('draft');
    expect(parsed.status).toBe('proposed');
  });

  it('includes the id, title, intent, code_paths, and steps as given', () => {
    const parsed = parseYaml(renderDraftTour(BASE));
    expect(parsed.id).toBe('dashboard-export');
    expect(parsed.title).toBe('Export dashboard data');
    expect(parsed.code_paths).toEqual(['demo-app/src/pages/Dashboard.jsx']);
    expect(parsed.steps).toHaveLength(4);
    expect(parsed.steps[2]).toEqual({ action: 'click', selector: "role=button[name='Export CSV']" });
  });

  it('produces YAML that loadTour accepts as valid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tour-scaffold-test-'));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'dashboard-export.yaml'), renderDraftTour(BASE));
    const tour = loadTour(dir, 'dashboard-export');
    expect(tour.id).toBe('dashboard-export');
    expect(tour.status).toBe('proposed');
  });

  it('omits path/selector fields that were not provided', () => {
    const yaml = renderDraftTour({
      ...BASE,
      steps: [{ action: 'goto', path: '/dashboard' }],
    });
    expect(yaml).not.toContain('selector:');
  });

  it('leaves a TODO instead of preconditions when auth is not given', () => {
    const yaml = renderDraftTour(BASE);
    expect(yaml).toContain('TODO: add preconditions');
    expect(yaml).not.toContain('preconditions:');
  });

  it('includes preconditions.auth when tour-scout names a profile it needed', () => {
    const yaml = renderDraftTour({ ...BASE, auth: 'standard-user' });
    const parsed = parseYaml(yaml);
    expect(parsed.preconditions).toEqual({ auth: 'standard-user' });
    expect(yaml).not.toContain('TODO: add preconditions');
  });

  it('produces loadable YAML for a double-quote-bearing role locator', () => {
    // The exact selector style lib/validate.mjs recommends —
    // role=button[name="..."] — contains a literal `"`. Naive
    // `"${selector}"` interpolation breaks the surrounding YAML string; this
    // must round-trip through loadTour without error.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tour-scaffold-test-'));
    tmpDirs.push(dir);
    const yaml = renderDraftTour({
      ...BASE,
      steps: [
        { action: 'goto', path: '/dashboard' },
        { action: 'click', selector: 'role=button[name="Save"]' },
      ],
    });
    fs.writeFileSync(path.join(dir, 'dashboard-export.yaml'), yaml);
    const tour = loadTour(dir, 'dashboard-export');
    expect(tour.steps[1].selector).toBe('role=button[name="Save"]');
  });

  it('produces loadable YAML for a title/intent/description containing a double quote', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tour-scaffold-test-'));
    tmpDirs.push(dir);
    const yaml = renderDraftTour({
      ...BASE,
      title: 'The "Export CSV" button',
      intent: 'Shows the "Export CSV" flow.',
      steps: [{ capture: 'shot', description: 'The "Export CSV" button, visible' }],
    });
    fs.writeFileSync(path.join(dir, 'dashboard-export.yaml'), yaml);
    const tour = loadTour(dir, 'dashboard-export');
    expect(tour.title).toBe('The "Export CSV" button');
    expect(tour.intent).toBe('Shows the "Export CSV" flow.');
    expect(tour.steps[0].description).toBe('The "Export CSV" button, visible');
  });
});
