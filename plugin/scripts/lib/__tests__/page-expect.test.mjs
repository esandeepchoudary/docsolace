import { describe, expect, it } from 'vitest';
import { loadTour } from '../tours.mjs';
import { matchesExpectedPath } from '../page-expect.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const O = 'http://localhost:3000';

describe('matchesExpectedPath', () => {
  it('matches exact paths ignoring query, hash and trailing slash', () => {
    expect(matchesExpectedPath(`${O}/billing?tab=1#x`, '/billing', O)).toBe(true);
    expect(matchesExpectedPath(`${O}/billing/`, '/billing', O)).toBe(true);
    expect(matchesExpectedPath(`${O}/login`, '/billing', O)).toBe(false);
  });
  it('supports a trailing * prefix and rejects other origins', () => {
    expect(matchesExpectedPath(`${O}/settings/profile`, '/settings/*', O)).toBe(true);
    expect(matchesExpectedPath(`${O}/other`, '/settings/*', O)).toBe(false);
    expect(matchesExpectedPath('https://evil.example/billing', '/billing', O)).toBe(false);
    expect(matchesExpectedPath('not a url', '/billing', O)).toBe(false);
  });
});

function load(yamlText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-pe-'));
  fs.writeFileSync(path.join(dir, 't.yaml'), yamlText);
  try {
    return loadTour(dir, 't');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('tour validation of step expectations', () => {
  const head = 'id: t\nsteps:\n';
  it('accepts expectUrl/expectVisible/waitFor where valid', () => {
    const tour = load(
      `${head}  - action: goto\n    path: /billing\n    expectUrl: /billing\n    waitFor: "role=heading[name='Billing']"\n  - capture: home\n    description: x\n    expectUrl: /billing\n    expectVisible: "role=heading[name='Billing']"\n`,
    );
    expect(tour.steps[0].expectUrl).toBe('/billing');
  });
  it('rejects bad values and misplaced fields', () => {
    expect(() => load(`${head}  - action: goto\n    path: /a\n    expectUrl: https://x.example\n`)).toThrow(/expectUrl/);
    expect(() => load(`${head}  - action: goto\n    path: /a\n    expectVisible: ""\n`)).toThrow(/expectVisible/);
    expect(() => load(`${head}  - action: hover\n    selector: "role=button"\n    expectUrl: /a\n`)).toThrow(/expectUrl/);
    expect(() => load(`${head}  - capture: c\n    description: x\n    waitFor: "role=button"\n`)).toThrow(/waitFor/);
  });
});
