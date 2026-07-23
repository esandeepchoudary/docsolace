import { describe, expect, it } from 'vitest';
import { resolveSeed } from '../seed.mjs';

describe('resolveSeed', () => {
  it('errors when the seed id is not a valid kebab-case slug', () => {
    const result = resolveSeed({ seeds: {} }, '../../etc/passwd');
    expect(result.action).toBe('error');
    expect(result.message).toMatch(/invalid/);
  });

  it('errors when the seed id has no matching entry under config.seeds', () => {
    const result = resolveSeed({ seeds: { 'demo-baseline': { description: 'x' } } }, 'missing-seed');
    expect(result.action).toBe('error');
    expect(result.message).toContain('missing-seed');
  });

  it('errors when config.seeds is entirely absent', () => {
    const result = resolveSeed({}, 'demo-baseline');
    expect(result.action).toBe('error');
  });

  it('is a noop for a defined seed with no command', () => {
    const config = { seeds: { 'demo-baseline': { description: 'Static demo data.' } } };
    const result = resolveSeed(config, 'demo-baseline');
    expect(result).toEqual({ action: 'noop', message: expect.stringContaining('no command') });
  });

  it('a noop seed is unaffected by allowSeedCommands', () => {
    const config = { seeds: { 'demo-baseline': { description: 'Static demo data.' } } };
    expect(resolveSeed(config, 'demo-baseline', { allowSeedCommands: true }).action).toBe('noop');
  });

  it('skips a seed command when allowSeedCommands is off (the default)', () => {
    const config = { seeds: { fixture: { command: 'npm run seed' } } };
    const result = resolveSeed(config, 'fixture');
    expect(result.action).toBe('skipped-disabled');
    expect(result.command).toBe('npm run seed');
    expect(result.message).toContain('allowSeedCommands');
  });

  it('skips explicitly even when allowSeedCommands is passed but false', () => {
    const config = { seeds: { fixture: { command: 'npm run seed' } } };
    expect(resolveSeed(config, 'fixture', { allowSeedCommands: false }).action).toBe('skipped-disabled');
  });

  it('runs a seed command when allowSeedCommands is enabled', () => {
    const config = { seeds: { fixture: { command: 'npm run seed' } } };
    const result = resolveSeed(config, 'fixture', { allowSeedCommands: true });
    expect(result).toEqual({ action: 'run', command: 'npm run seed', message: expect.stringContaining('npm run seed') });
  });
});
