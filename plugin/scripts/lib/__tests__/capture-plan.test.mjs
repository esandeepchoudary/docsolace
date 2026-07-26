import { describe, expect, it } from 'vitest';
import { planCaptureBatches } from '../capture-plan.mjs';

function tour(id, overrides = {}) {
  return { id, ...overrides };
}

describe('planCaptureBatches', () => {
  it('groups non-seeded tours into batches of at most `concurrency`, preserving order', () => {
    const tours = [tour('a'), tour('b'), tour('c'), tour('d'), tour('e')];
    const batches = planCaptureBatches(tours, { concurrency: 2 });
    expect(batches).toEqual([[tour('a'), tour('b')], [tour('c'), tour('d')], [tour('e')]]);
  });

  it('defaults concurrency to 3', () => {
    const tours = [tour('a'), tour('b'), tour('c'), tour('d')];
    const batches = planCaptureBatches(tours);
    expect(batches).toEqual([[tour('a'), tour('b'), tour('c')], [tour('d')]]);
  });

  it('puts a seeded tour alone in its own batch, never grouped with another tour', () => {
    const seeded = tour('checkout', { preconditions: { seed: 'demo-baseline' } });
    const batches = planCaptureBatches([tour('a'), seeded, tour('b')], { concurrency: 3 });
    expect(batches).toEqual([[tour('a')], [seeded], [tour('b')]]);
  });

  it('flushes a partial pending batch before a seeded tour, then resumes queueing after it', () => {
    const seeded = tour('checkout', { preconditions: { seed: 'demo-baseline' } });
    const batches = planCaptureBatches([tour('a'), tour('b'), tour('c'), seeded, tour('d'), tour('e')], {
      concurrency: 3,
    });
    expect(batches).toEqual([
      [tour('a'), tour('b'), tour('c')],
      [seeded],
      [tour('d'), tour('e')],
    ]);
  });

  it('never merges two adjacent seeded tours into one batch', () => {
    const seed1 = tour('a', { preconditions: { seed: 's1' } });
    const seed2 = tour('b', { preconditions: { seed: 's2' } });
    const batches = planCaptureBatches([seed1, seed2], { concurrency: 3 });
    expect(batches).toEqual([[seed1], [seed2]]);
  });

  it('returns an empty list for no tours', () => {
    expect(planCaptureBatches([], { concurrency: 3 })).toEqual([]);
  });

  it('throws for a non-positive-integer concurrency', () => {
    expect(() => planCaptureBatches([tour('a')], { concurrency: 0 })).toThrow(/positive integer/);
    expect(() => planCaptureBatches([tour('a')], { concurrency: 1.5 })).toThrow(/positive integer/);
    expect(() => planCaptureBatches([tour('a')], { concurrency: -1 })).toThrow(/positive integer/);
  });
});
