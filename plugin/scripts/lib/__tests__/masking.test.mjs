import { describe, expect, it } from 'vitest';
import { mergeMasks } from '../masking.mjs';

describe('mergeMasks', () => {
  it('combines defaults and step-specific selectors', () => {
    expect(mergeMasks(['.timestamp'], ['.custom'])).toEqual(['.timestamp', '.custom']);
  });

  it('dedupes selectors present in both', () => {
    expect(mergeMasks(['.timestamp', '.user-avatar'], ['.user-avatar'])).toEqual([
      '.timestamp',
      '.user-avatar',
    ]);
  });

  it('handles missing defaultMask or stepMask', () => {
    expect(mergeMasks(undefined, ['.custom'])).toEqual(['.custom']);
    expect(mergeMasks(['.timestamp'], undefined)).toEqual(['.timestamp']);
    expect(mergeMasks(undefined, undefined)).toEqual([]);
  });
});

import { redactSnapshotText } from '../masking.mjs';

describe('redactSnapshotText', () => {
  it('removes masked strings from the snapshot text', () => {
    const snap = '- heading "Billing"\n- text: DOCSOLACE_SECRET_CANARY_123\n- textbox "DOCSOLACE_SECRET_CANARY_123"';
    const out = redactSnapshotText(snap, ['DOCSOLACE_SECRET_CANARY_123']);
    expect(out).not.toContain('CANARY');
    expect(out).toContain('Billing');
  });

  it('redacts the longer string first so a prefix cannot split it', () => {
    const out = redactSnapshotText('- text: alice@example.com', ['alice', 'alice@example.com']);
    expect(out).toBe('- text: [redacted]');
  });

  it('only matches very short secrets as whole words', () => {
    expect(redactSnapshotText('- text: 5 items, id 15', ['5'])).toBe('- text: [redacted] items, id 15');
  });

  it('escapes regex characters and ignores empty input', () => {
    expect(redactSnapshotText('cost (a+b)', ['(a+b)', '', '  '])).toBe('cost [redacted]');
    expect(redactSnapshotText('x', undefined)).toBe('x');
  });
});
