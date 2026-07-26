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

  it('throws when a viewport name contains HTML metacharacters (it gets embedded in generated docs)', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + 'viewports:\n  \'desktop"><script>\':\n    width: 1280\n    height: 800\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/viewport ".*" is invalid.*lowercase kebab-case/s);
  });

  it('throws when a viewport name contains a path-traversal segment', () => {
    const filePath = writeTmpYaml(VALID_BASE + 'viewports:\n  ../../etc:\n    width: 1280\n    height: 800\n');
    expect(() => loadConfig(filePath)).toThrow(/is invalid.*lowercase kebab-case/s);
  });

  it('accepts a hyphenated lowercase viewport name', () => {
    const filePath = writeTmpYaml(VALID_BASE + 'viewports:\n  large-desktop:\n    width: 1920\n    height: 1080\n');
    expect(loadConfig(filePath).viewports['large-desktop']).toEqual({ width: 1920, height: 1080 });
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

  it('accepts a full valid crawl section', () => {
    const crawl =
      'crawl:\n  maxPages: 25\n  maxDepth: 3\n  startPaths:\n    - /\n    - /dashboard\n' +
      '  excludePaths:\n    - /logout\n  allowInteractive: false\n';
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + crawl);
    expect(loadConfig(filePath).crawl).toEqual({
      maxPages: 25,
      maxDepth: 3,
      startPaths: ['/', '/dashboard'],
      excludePaths: ['/logout'],
      allowInteractive: false,
    });
  });

  it('throws when crawl is not an object', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'crawl: "nope"\n');
    expect(() => loadConfig(filePath)).toThrow(/"crawl" must be an object/);
  });

  it('throws when crawl.maxPages is not a positive number', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'crawl:\n  maxPages: 0\n');
    expect(() => loadConfig(filePath)).toThrow(/"crawl.maxPages" must be a positive number/);
  });

  it('throws when crawl.maxDepth is not a number', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'crawl:\n  maxDepth: "deep"\n');
    expect(() => loadConfig(filePath)).toThrow(/"crawl.maxDepth" must be a positive number/);
  });

  it('throws when crawl.startPaths entries are not site-relative', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'crawl:\n  startPaths:\n    - https://evil.example\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/"crawl.startPaths" must be a list of site-relative paths/);
  });

  it('throws when crawl.allowInteractive is not a boolean', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'crawl:\n  allowInteractive: "yes"\n');
    expect(() => loadConfig(filePath)).toThrow(/"crawl.allowInteractive" must be a boolean/);
  });

  it('omitting docs entirely stays valid', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS);
    expect(loadConfig(filePath).docs).toBeUndefined();
  });

  it('accepts a docs section naming a real viewport', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'docs:\n  primaryViewport: desktop\n  collapseOtherViewports: true\n',
    );
    expect(loadConfig(filePath).docs).toEqual({ primaryViewport: 'desktop', collapseOtherViewports: true });
  });

  it('throws when docs.primaryViewport does not name a configured viewport', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  primaryViewport: tablet\n');
    expect(() => loadConfig(filePath)).toThrow(/"docs.primaryViewport".*must name one of the configured/);
  });

  it('throws when docs.collapseOtherViewports is not a boolean', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  collapseOtherViewports: "yes"\n');
    expect(() => loadConfig(filePath)).toThrow(/"docs.collapseOtherViewports" must be a boolean/);
  });

  it('accepts docs.stampVerified as a boolean', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  stampVerified: true\n');
    expect(loadConfig(filePath).docs).toEqual({ stampVerified: true });
  });

  it('throws when docs.stampVerified is not a boolean', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  stampVerified: "yes"\n');
    expect(() => loadConfig(filePath)).toThrow(/"docs.stampVerified" must be a boolean/);
  });

  it('throws when docs is not an object', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs: "nope"\n');
    expect(() => loadConfig(filePath)).toThrow(/"docs" must be an object/);
  });

  it('accepts a valid docs.sections list', () => {
    const sections =
      'docs:\n  sections:\n    - label: "Getting started"\n      tours: [login]\n' +
      '    - label: "Dashboard"\n      tours: [dashboard-overview, dashboard-export]\n';
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + sections);
    expect(loadConfig(filePath).docs.sections).toEqual([
      { label: 'Getting started', tours: ['login'] },
      { label: 'Dashboard', tours: ['dashboard-overview', 'dashboard-export'] },
    ]);
  });

  it('throws when docs.sections is not a list', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  sections: "nope"\n');
    expect(() => loadConfig(filePath)).toThrow(/"docs.sections" must be a list/);
  });

  it('throws when a docs.sections entry has no label', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  sections:\n    - tours: [login]\n');
    expect(() => loadConfig(filePath)).toThrow(/label/);
  });

  it('throws when a docs.sections entry has an unsafe label', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'docs:\n  sections:\n    - label: "<script>alert(1)</script>"\n      tours: [login]\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/metacharacters/);
  });

  it('throws when a docs.sections entry has an empty tours list', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'docs:\n  sections:\n    - label: "x"\n      tours: []\n');
    expect(() => loadConfig(filePath)).toThrow(/non-empty list of tour ids/);
  });

  it('throws when a docs.sections tour id is not a safe kebab-case slug', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'docs:\n  sections:\n    - label: "x"\n      tours: ["../../etc"]\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/lowercase kebab-case tour id/);
  });

  it('throws when the same tour id appears in two different docs.sections entries', () => {
    // Regression: a tour listed in two sections shows up in both categories
    // in the generated sidebar (docs/_sidebar.autodocs.json) and throws off
    // every later tour's computed sidebar_position — reproduced directly
    // via lib/product.mjs's buildSidebarStructure/computeTourSidebarPositions
    // before this check existed.
    const sections = 'docs:\n  sections:\n    - label: "A"\n      tours: [login]\n    - label: "B"\n      tours: [login, dashboard-overview]\n';
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + sections);
    expect(() => loadConfig(filePath)).toThrow(/tour "login" appears in both/);
  });

  it('throws when the same tour id is repeated within one docs.sections entry\'s own tours list', () => {
    const filePath = writeTmpYaml(
      VALID_BASE + VALID_VIEWPORTS + 'docs:\n  sections:\n    - label: "A"\n      tours: [login, login]\n',
    );
    expect(() => loadConfig(filePath)).toThrow(/tour "login" appears in both/);
  });

  it('omitting product entirely stays valid', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS);
    expect(loadConfig(filePath).product).toBeUndefined();
  });

  it('accepts a valid product section', () => {
    const product =
      'product:\n  name: "My App"\n  pages: [overview, concepts]\n  sources:\n    - "docs-src/**/*.md"\n';
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + product);
    expect(loadConfig(filePath).product).toEqual({
      name: 'My App',
      pages: ['overview', 'concepts'],
      sources: ['docs-src/**/*.md'],
    });
  });

  it('throws when product is not an object', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product: "nope"\n');
    expect(() => loadConfig(filePath)).toThrow(/"product" must be an object/);
  });

  it('throws when product.name is an empty string', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  name: "   "\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.name" must be a non-empty string/);
  });

  it('throws when product.pages is empty', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  pages: []\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.pages" must be a non-empty list/);
  });

  it('throws when product.pages names an unknown page', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  pages: [overview, faq]\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.pages" names unknown page\(s\) faq/);
  });

  it('throws when product.sources is not a list', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  sources: "nope"\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.sources" must be a list of globs/);
  });

  it('throws when a product.sources entry is an absolute path', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  sources:\n    - "/etc/passwd"\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.sources" entry .* is invalid/s);
  });

  it('throws when a product.sources entry contains a ".." segment', () => {
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  sources:\n    - "../../secrets/**"\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.sources" entry .* is invalid/s);
  });

  it('throws when a product.sources entry uses brace expansion, even with no literal ".." segment', () => {
    // Regression guard for a confirmed bypass: "{..,x}/*secret*" has no path
    // segment that is literally ".." (the segment is the string "{..,x}"),
    // so the ".." check alone would let it through — glob's own brace
    // expansion then turns it into a real "../*secret*" match at resolve
    // time. Braces must be rejected outright at the pattern-string level too.
    const filePath = writeTmpYaml(VALID_BASE + VALID_VIEWPORTS + 'product:\n  sources:\n    - "{..,x}/*secret*"\n');
    expect(() => loadConfig(filePath)).toThrow(/"product.sources" entry .* is invalid.*brace/s);
  });
});
