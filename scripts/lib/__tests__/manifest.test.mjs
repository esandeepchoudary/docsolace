import { describe, expect, it } from 'vitest';
import { buildManifest, sha256Buffer } from '../manifest.mjs';

describe('sha256Buffer', () => {
  it('hashes an empty buffer to the well-known empty-string SHA-256', () => {
    expect(sha256Buffer(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "hello" to its well-known SHA-256', () => {
    expect(sha256Buffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('produces different hashes for different content', () => {
    expect(sha256Buffer(Buffer.from('a'))).not.toBe(sha256Buffer(Buffer.from('b')));
  });
});

describe('buildManifest', () => {
  it('builds a manifest with tourId, captures, and a generatedAt timestamp', () => {
    const captures = [{ name: 'shot-1', sha256: 'abc' }];
    const manifest = buildManifest('login', captures, '2026-01-01T00:00:00.000Z');
    expect(manifest).toEqual({
      tourId: 'login',
      generatedAt: '2026-01-01T00:00:00.000Z',
      captures,
    });
  });

  it('defaults generatedAt to an ISO timestamp when not provided', () => {
    const manifest = buildManifest('login', []);
    expect(() => new Date(manifest.generatedAt).toISOString()).not.toThrow();
    expect(new Date(manifest.generatedAt).toISOString()).toBe(manifest.generatedAt);
  });
});
