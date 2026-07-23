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
