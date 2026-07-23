import { describe, expect, it } from 'vitest';
import { decideCompletionMode } from '../auth-save.mjs';

describe('decideCompletionMode', () => {
  it('prefers url-wait whenever a wait pattern is available, TTY or not', () => {
    expect(decideCompletionMode({ isTTY: true, waitFor: '**/dashboard' })).toBe('url-wait');
    expect(decideCompletionMode({ isTTY: false, waitFor: '**/dashboard' })).toBe('url-wait');
  });

  it('falls back to enter when there is no wait pattern but stdin is a real TTY', () => {
    expect(decideCompletionMode({ isTTY: true, waitFor: undefined })).toBe('enter');
  });

  it('refuses instead of hanging when there is no wait pattern and stdin is not a TTY', () => {
    expect(decideCompletionMode({ isTTY: false, waitFor: undefined })).toBe('error-nontty');
  });

  it('treats an empty-string wait pattern the same as absent', () => {
    expect(decideCompletionMode({ isTTY: true, waitFor: '' })).toBe('enter');
    expect(decideCompletionMode({ isTTY: false, waitFor: '' })).toBe('error-nontty');
  });
});
