import { describe, expect, it } from 'vitest';
import { setTourStatus, TOUR_STATUSES } from '../tour-lifecycle.mjs';

describe('setTourStatus', () => {
  it('replaces an existing top-level status line, leaving everything else untouched', () => {
    const yaml = `id: dashboard\nmaturity: stable\nstatus: confirmed\nsteps:\n  - action: goto\n    path: /dashboard\n`;
    const result = setTourStatus(yaml, 'archived');
    expect(result).toBe(
      `id: dashboard\nmaturity: stable\nstatus: archived\nsteps:\n  - action: goto\n    path: /dashboard\n`,
    );
  });

  it('inserts a status line right after maturity when there is none yet', () => {
    const yaml = `id: login\nmaturity: stable\nsteps:\n  - action: goto\n    path: /login\n`;
    const result = setTourStatus(yaml, 'archived');
    expect(result).toBe(`id: login\nmaturity: stable\nstatus: archived\nsteps:\n  - action: goto\n    path: /login\n`);
  });

  it('does not touch a nested field that happens to be named "status" (e.g. inside a comment or string)', () => {
    // Only a line starting at column 0 with "status:" is a top-level field —
    // guards against a false match on indented/nested YAML.
    const yaml = `id: x\nmaturity: stable\nstatus: confirmed\npreconditions:\n  auth: standard-user\n`;
    const result = setTourStatus(yaml, 'proposed');
    expect(result).toContain('  auth: standard-user');
    expect(result).toContain('status: proposed');
  });

  it('appends a status line at the end when there is no maturity line either', () => {
    const yaml = `id: weird\nsteps:\n  - action: goto\n    path: /x\n`;
    const result = setTourStatus(yaml, 'archived');
    expect(result.trim().endsWith('status: archived')).toBe(true);
  });

  it('is idempotent when the status is already the target value', () => {
    const yaml = `id: x\nmaturity: stable\nstatus: archived\n`;
    expect(setTourStatus(yaml, 'archived')).toBe(yaml);
  });

  it('rejects an invalid status value', () => {
    expect(() => setTourStatus('id: x\nmaturity: stable\n', 'deleted')).toThrow(/not a valid tour status/);
  });

  it('exports the full valid status enum', () => {
    expect(TOUR_STATUSES).toEqual(['confirmed', 'proposed', 'archived']);
  });
});
