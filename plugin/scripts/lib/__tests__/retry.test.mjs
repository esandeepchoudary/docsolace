import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../retry.mjs';

describe('withRetry', () => {
  it('returns the result without retrying when fn succeeds on the first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, { delayMs: 1 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure and returns the eventual success', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValueOnce('ok');
    expect(await withRetry(fn, { retries: 2, delayMs: 1 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once retries are exhausted', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('third'));
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).rejects.toThrow('third');
    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it('defaults to 2 retries (3 total attempts) when no options are given', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    // Override delayMs only, keep the default retry count, to verify the
    // default without slowing the test down.
    await expect(withRetry(fn, { delayMs: 1 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not sleep after the final attempt (fails fast once retries are exhausted)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const start = Date.now();
    await expect(withRetry(fn, { retries: 1, delayMs: 200 })).rejects.toThrow('boom');
    // One retry means exactly one delay is ever awaited (between attempt 0
    // and attempt 1) — if a delay were mistakenly awaited after the final
    // attempt too, this would take >= 400ms instead of ~200ms.
    expect(Date.now() - start).toBeLessThan(350);
  });
});
