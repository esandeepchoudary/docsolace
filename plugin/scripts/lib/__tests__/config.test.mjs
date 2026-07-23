import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.mjs';

const tmpFiles = [];
const VALID_BASE = 'baseUrl: http://localhost:5173\noutputDir: .autodocs/artifacts\n';
const VALID_VIEWPORTS = 'viewports:\n  desktop:\n    width: 1280\n    height: 800\n';

function writeTmpYaml(contents) {
  const filePath = path.join(os.tmpdir(), `autodocs-config-test-${Date.now()}-${Math.random()}.yaml`);
  fs.writeFileSync(filePath, contents);
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  while (tmpFiles.length) fs.rmSync(tmpFiles.pop(), { force: true });
});

describe('loadConfig', () => {
  it('loads a valid config', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS);
    expect(loadConfig(filePath)).toEqual({
      baseUrl: 'http://localhost:5173',
      outputDir: '.autodocs/artifacts',
      viewports: { desktop: { width: 1280, height: 800 } },
    });
  });

  it('throws when baseUrl is missing', () => {
    const filePath = writeTmpYaml('outputDir: .autodocs/artifacts\n' + VALID_VIEWPORTS);
    expect(() => loadConfig(filePath)).toThrow(/baseUrl/);
  });

  it('throws a path-including error (not a bare parser message) when the file is empty', () => {
    // js-yaml itself throws "expected a document, but the input is empty"
    // for a fully empty file — rewrapped so it includes the config path and
    // matches this file's error-message convention.
    const filePath = writeTmpYaml('');
    expect(() => loadConfig(filePath)).toThrow(`autodocs config at "${filePath}"`);
    expect(() => loadConfig(filePath)).toThrow(/not valid YAML/);
  });

  it('throws the same path-including error when the file is whitespace-only', () => {
    const filePath = writeTmpYaml('   \n\n  ');
    expect(() => loadConfig(filePath)).toThrow(/not valid YAML/);
  });

  it('throws a clear error (not a bare TypeError) when the document is null', () => {
    // A file containing just "null" (or "~") parses to JS null without
    // throwing — config.baseUrl on null would otherwise be a raw TypeError.
    const filePath = writeTmpYaml('null\n');
    expect(() => loadConfig(filePath)).toThrow(/empty or not a valid YAML object/);
  });

  it('throws a clear error when the document is a scalar, not a mapping', () => {
    const filePath = writeTmpYaml('just a string\n');
    expect(() => loadConfig(filePath)).toThrow(/empty or not a valid YAML object/);
  });

  it('throws a clear error when the document is a list, not a mapping', () => {
    const filePath = writeTmpYaml('- one\n- two\n');
    expect(() => loadConfig(filePath)).toThrow(/empty or not a valid YAML object/);
  });

  it('throws when outputDir is missing', () => {
    const filePath = writeTmpYaml('baseUrl: http://localhost:5173\n' + VALID_VIEWPORTS);
    expect(() => loadConfig(filePath)).toThrow(/outputDir/);
  });

  it('throws when viewports is missing', () => {
    const filePath = writeTmpYaml(VALID_BASE);
    expect(() => loadConfig(filePath)).toThrow(/viewports/);
  });

  it('throws when viewports is an empty object', () => {
    const filePath = writeTmpYaml(VALID_BASE + 'viewports: {}\n');
    expect(() => loadConfig(filePath)).toThrow(/viewports/);
  });

  it('throws when a viewport is missing numeric width/height', () => {
    const filePath = writeTmpYaml(VALID_BASE + 'viewports:\n  desktop:\n    width: 1280\n');
    expect(() => loadConfig(filePath)).toThrow(/viewport "desktop"/);
  });

  it('throws when pixelDiffThreshold is out of range', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'pixelDiffThreshold: 1.5\n');
    expect(() => loadConfig(filePath)).toThrow(/pixelDiffThreshold/);
  });

  it('accepts a valid pixelDiffThreshold', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'pixelDiffThreshold: 0.02\n');
    expect(loadConfig(filePath).pixelDiffThreshold).toBe(0.02);
  });

  it('throws when defaultMask is not a list', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'defaultMask: ".foo"\n');
    expect(() => loadConfig(filePath)).toThrow(/defaultMask/);
  });

  it('throws when launchArgs is not a list', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'launchArgs: "--no-sandbox"\n');
    expect(() => loadConfig(filePath)).toThrow(/launchArgs/);
  });

  it('accepts an auth profile with only storageStatePath', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'auth:\n  sso-user:\n    storageStatePath: .auth/sso.json\n',
    );
    expect(loadConfig(filePath).auth['sso-user'].storageStatePath).toBe('.auth/sso.json');
  });

  it('accepts an auth profile with all scripted-login fields', () => {
    const scripted =
      'auth:\n  standard-user:\n' +
      '    loginUrl: /login\n' +
      '    usernameSelector: "#username"\n' +
      '    passwordSelector: "#password"\n' +
      '    submitSelector: "button"\n' +
      '    usernameEnv: USER_ENV\n' +
      '    passwordEnv: PASS_ENV\n' +
      '    successUrlPattern: "**/dashboard"\n';
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + scripted);
    expect(loadConfig(filePath).auth['standard-user'].loginUrl).toBe('/login');
  });

  it('throws when an auth profile has neither storageStatePath nor the full scripted-login set', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'auth:\n  broken:\n    loginUrl: /login\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/auth profile "broken"/);
  });

  it('accepts a seed with only a description and no command', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'seeds:\n  demo-baseline:\n    description: "Static demo data."\n',
    );
    expect(loadConfig(filePath).seeds['demo-baseline']).toEqual({ description: 'Static demo data.' });
  });

  it('accepts a seed with a command', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'seeds:\n  fixture:\n    description: "x"\n    command: "npm run seed"\n',
    );
    expect(loadConfig(filePath).seeds.fixture.command).toBe('npm run seed');
  });

  it('throws when seeds is not a map', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'seeds: "not-a-map"\n');
    expect(() => loadConfig(filePath)).toThrow(/"seeds" must be a map/);
  });

  it('throws when a seed command is an empty string', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'seeds:\n  fixture:\n    command: ""\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/seed "fixture".*"command"/);
  });

  it('accepts allowSeedCommands as a boolean', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'allowSeedCommands: true\n');
    expect(loadConfig(filePath).allowSeedCommands).toBe(true);
  });

  it('throws when allowSeedCommands is not a boolean', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'allowSeedCommands: "yes"\n');
    expect(() => loadConfig(filePath)).toThrow(/"allowSeedCommands" must be a boolean/);
  });
});
