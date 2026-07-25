import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { assertSafeLabel } from './design.mjs';
import { PRODUCT_PAGE_IDS } from './product.mjs';
import { SLUG_RE } from './tours.mjs';

// Same lowercase-kebab-case constraint as tours.mjs's tour-id SLUG_RE.
// Viewport names flow, unmodified, into a screenshot filename
// (`${capture}@${viewportName}.png` — capture.mjs/generate-docs.mjs) and,
// since this diff, into a raw HTML `<details class="...">` block in
// generated markdown (lib/docgen.mjs's renderTourPage) — a config that let
// a viewport name contain "/", "..", or HTML metacharacters would reach
// either downstream unvalidated. Config is untrusted input for exactly this
// reason (CLAUDE.md's SSDLC section), so it's constrained at load time here
// rather than trusted to already be safe.
const VIEWPORT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SCRIPTED_AUTH_FIELDS = [
  'loginUrl',
  'usernameSelector',
  'passwordSelector',
  'submitSelector',
  'usernameEnv',
  'passwordEnv',
  'successUrlPattern',
];

// Two auth-profile shapes are valid: a saved-session profile (just
// storageStatePath) or a fully-specified scripted-login profile. Anything
// else is a config typo that would otherwise only surface deep inside
// capture.mjs's ensureAuthState, mid-tour — catch it upfront instead.
function assertValidAuthProfile(configPath, profileId, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`autodocs config at "${configPath}": auth profile "${profileId}" must be an object`);
  }
  if (profile.storageStatePath !== undefined) {
    if (typeof profile.storageStatePath !== 'string' || !profile.storageStatePath) {
      throw new Error(
        `autodocs config at "${configPath}": auth profile "${profileId}"'s "storageStatePath" must be a non-empty string`,
      );
    }
    return;
  }
  const missing = SCRIPTED_AUTH_FIELDS.filter((field) => typeof profile[field] !== 'string' || !profile[field]);
  if (missing.length > 0) {
    throw new Error(
      `autodocs config at "${configPath}": auth profile "${profileId}" must have either "storageStatePath" ` +
        `(reuse a saved session) or all of ${SCRIPTED_AUTH_FIELDS.join(', ')} (scripted login) — missing: ${missing.join(', ')}`,
    );
  }
}

export function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  let config;
  try {
    config = parseYaml(raw);
  } catch (err) {
    // js-yaml throws its own YAMLException for a syntactically broken or
    // fully empty/whitespace-only file — rewrap so every config-loading
    // failure follows this file's `autodocs config at "<path>": ...`
    // convention instead of a bare, path-less parser message.
    throw new Error(`autodocs config at "${configPath}" is not valid YAML (${err.message})`);
  }
  // A `null` document (e.g. a file containing just "null"/"~") or a
  // scalar/array document (valid YAML, just not a mapping) parses without
  // throwing — the field checks below would then throw a raw "Cannot read
  // properties of null/undefined" TypeError instead of the actionable
  // message they're meant to give. tours.mjs's loadTour has the parallel
  // guard for the same reason.
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`autodocs config at "${configPath}" is empty or not a valid YAML object`);
  }
  if (!config.baseUrl) {
    throw new Error(`autodocs config at "${configPath}" is missing required "baseUrl"`);
  }
  if (!config.outputDir) {
    throw new Error(`autodocs config at "${configPath}" is missing required "outputDir"`);
  }
  if (!config.viewports || Object.keys(config.viewports).length === 0) {
    throw new Error(`autodocs config at "${configPath}" needs at least one entry under "viewports"`);
  }
  for (const [name, size] of Object.entries(config.viewports)) {
    if (!VIEWPORT_NAME_RE.test(name)) {
      throw new Error(
        `autodocs config at "${configPath}": viewport "${name}" is invalid — must be a lowercase kebab-case ` +
          `name (letters, digits, hyphens only, no leading/trailing hyphen), since it's used to build file ` +
          `names and rendered into generated docs`,
      );
    }
    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') {
      throw new Error(
        `autodocs config at "${configPath}": viewport "${name}" needs a numeric "width" and "height"`,
      );
    }
  }
  if (
    config.pixelDiffThreshold !== undefined &&
    (typeof config.pixelDiffThreshold !== 'number' ||
      config.pixelDiffThreshold < 0 ||
      config.pixelDiffThreshold > 1)
  ) {
    throw new Error(
      `autodocs config at "${configPath}": "pixelDiffThreshold" must be a number between 0 and 1`,
    );
  }
  if (config.defaultMask !== undefined && !Array.isArray(config.defaultMask)) {
    throw new Error(`autodocs config at "${configPath}": "defaultMask" must be a list of selectors`);
  }
  if (config.launchArgs !== undefined && !Array.isArray(config.launchArgs)) {
    throw new Error(`autodocs config at "${configPath}": "launchArgs" must be a list of strings`);
  }
  if (config.auth !== undefined) {
    for (const [profileId, profile] of Object.entries(config.auth)) {
      assertValidAuthProfile(configPath, profileId, profile);
    }
  }
  if (config.seeds !== undefined) {
    if (typeof config.seeds !== 'object' || config.seeds === null || Array.isArray(config.seeds)) {
      throw new Error(`autodocs config at "${configPath}": "seeds" must be a map of seed id to definition`);
    }
    for (const [seedId, seed] of Object.entries(config.seeds)) {
      if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
        throw new Error(`autodocs config at "${configPath}": seed "${seedId}" must be an object`);
      }
      if (seed.command !== undefined && (typeof seed.command !== 'string' || !seed.command.trim())) {
        throw new Error(`autodocs config at "${configPath}": seed "${seedId}"'s "command" must be a non-empty string`);
      }
    }
  }
  if (config.allowSeedCommands !== undefined && typeof config.allowSeedCommands !== 'boolean') {
    throw new Error(`autodocs config at "${configPath}": "allowSeedCommands" must be a boolean`);
  }
  if (config.crawl !== undefined) {
    assertValidCrawlConfig(configPath, config.crawl);
  }
  if (config.docs !== undefined) {
    assertValidDocsConfig(configPath, config.docs, config.viewports);
  }
  if (config.product !== undefined) {
    assertValidProductConfig(configPath, config.product);
  }
  return config;
}

// product.sources entries are filesystem-relative globs handed straight to
// glob.globSync (lib/product.mjs's collectProductSources) and then to a
// Read-only subagent — same untrusted-config-input posture as everywhere
// else in this file. Rejecting an absolute path or a literal ".." segment
// here blocks the obvious escape (e.g. "/etc/passwd" or "../../secrets/**")
// at load time, before it ever reaches a glob — but a *literal* ".." segment
// isn't the only way a pattern *string* can still resolve outside the
// project: brace expansion (e.g. "{..,x}/*secret*") contains no segment
// that's literally "..", so it passes this check, yet glob still expands it
// into a real "../*secret*" match. Reject brace syntax outright too, rather
// than relying solely on lib/product.mjs's `nobrace: true` / resolved-path
// confinement (isWithinRoot) to catch it downstream — a clear error here
// beats a pattern that silently matches nothing there. Symlinks are a
// separate escape this can't catch at the *pattern* level at all (a
// perfectly innocent-looking pattern can match a tracked symlink pointing
// outside the project) — lib/product.mjs's own deny list and resolved-path
// confinement are what actually close that one, not this function.
function assertSafeSourceGlob(configPath, pattern) {
  if (typeof pattern !== 'string' || !pattern) {
    throw new Error(`autodocs config at "${configPath}": "product.sources" entries must be non-empty strings`);
  }
  if (
    path.isAbsolute(pattern) ||
    pattern.startsWith('/') ||
    pattern.split('/').includes('..') ||
    pattern.includes('{') ||
    pattern.includes('}')
  ) {
    throw new Error(
      `autodocs config at "${configPath}": "product.sources" entry "${pattern}" is invalid — must be a ` +
        `project-relative glob (no absolute path, no ".." segment, no "{...}" brace expansion).`,
    );
  }
}

// Controls generate-product-docs.mjs — which product-level pages to generate
// (default: all of lib/product.mjs's PRODUCT_PAGES) and what extra files
// ground them beyond the standing README/package.json/.env.example/
// autodocs.config.yaml set (see lib/product.mjs's collectProductSources).
function assertValidProductConfig(configPath, product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error(`autodocs config at "${configPath}": "product" must be an object`);
  }
  if (product.name !== undefined && (typeof product.name !== 'string' || !product.name.trim())) {
    throw new Error(`autodocs config at "${configPath}": "product.name" must be a non-empty string`);
  }
  if (product.pages !== undefined) {
    if (!Array.isArray(product.pages) || product.pages.length === 0) {
      throw new Error(`autodocs config at "${configPath}": "product.pages" must be a non-empty list`);
    }
    const unknown = product.pages.filter((p) => !PRODUCT_PAGE_IDS.includes(p));
    if (unknown.length > 0) {
      throw new Error(
        `autodocs config at "${configPath}": "product.pages" names unknown page(s) ${unknown.join(', ')} — ` +
          `must be a subset of ${PRODUCT_PAGE_IDS.join(', ')}`,
      );
    }
  }
  if (product.sources !== undefined) {
    if (!Array.isArray(product.sources)) {
      throw new Error(`autodocs config at "${configPath}": "product.sources" must be a list of globs`);
    }
    for (const pattern of product.sources) {
      assertSafeSourceGlob(configPath, pattern);
    }
  }
}

// crawl.allowInteractive gates crawl.mjs's mutating "safe form fill/submit"
// mode — same default-off, config-plus-flag double-opt-in shape as
// allowSeedCommands above, since an interactive crawl of a real
// authenticated app can trigger real side effects if left on by accident.
function assertValidCrawlConfig(configPath, crawl) {
  if (!crawl || typeof crawl !== 'object' || Array.isArray(crawl)) {
    throw new Error(`autodocs config at "${configPath}": "crawl" must be an object`);
  }
  for (const field of ['maxPages', 'maxDepth']) {
    if (crawl[field] !== undefined && (typeof crawl[field] !== 'number' || crawl[field] <= 0)) {
      throw new Error(`autodocs config at "${configPath}": "crawl.${field}" must be a positive number`);
    }
  }
  for (const field of ['startPaths', 'excludePaths']) {
    if (crawl[field] !== undefined) {
      if (!Array.isArray(crawl[field]) || crawl[field].some((p) => typeof p !== 'string' || !p.startsWith('/'))) {
        throw new Error(
          `autodocs config at "${configPath}": "crawl.${field}" must be a list of site-relative paths ` +
            `starting with "/"`,
        );
      }
    }
  }
  if (crawl.allowInteractive !== undefined && typeof crawl.allowInteractive !== 'boolean') {
    throw new Error(`autodocs config at "${configPath}": "crawl.allowInteractive" must be a boolean`);
  }
}

// Controls generate-docs.mjs's page layout — which viewport's screenshot
// stays inline versus which get collapsed into a <details> block (see
// lib/docgen.mjs's renderTourPage). A typo in primaryViewport would
// otherwise silently collapse *every* viewport (renderTourPage falls back to
// "first image" only when the named one isn't found among a step's images,
// so this is caught here instead of failing quietly downstream).
function assertValidDocsConfig(configPath, docs, viewports) {
  if (!docs || typeof docs !== 'object' || Array.isArray(docs)) {
    throw new Error(`autodocs config at "${configPath}": "docs" must be an object`);
  }
  if (docs.primaryViewport !== undefined) {
    if (typeof docs.primaryViewport !== 'string' || !docs.primaryViewport) {
      throw new Error(`autodocs config at "${configPath}": "docs.primaryViewport" must be a non-empty string`);
    }
    const knownViewports = Object.keys(viewports ?? {});
    if (!knownViewports.includes(docs.primaryViewport)) {
      throw new Error(
        `autodocs config at "${configPath}": "docs.primaryViewport" ("${docs.primaryViewport}") must name ` +
          `one of the configured "viewports" (${knownViewports.join(', ') || 'none configured'})`,
      );
    }
  }
  if (docs.collapseOtherViewports !== undefined && typeof docs.collapseOtherViewports !== 'boolean') {
    throw new Error(`autodocs config at "${configPath}": "docs.collapseOtherViewports" must be a boolean`);
  }
  if (docs.sections !== undefined) {
    assertValidDocsSections(configPath, docs.sections);
  }
}

// Optional sidebar grouping for tour pages (lib/product.mjs's
// buildSidebarStructure) — a project that doesn't set this gets one flat
// "everything else" group, same as before this feature existed. Each
// section's label goes through the same assertSafeLabel bar as everywhere
// else short plain text reaches a generated page/site config; each tour id
// must be a real, safe slug (same SLUG_RE loadTour enforces) since it's
// joined into a docs/<id>.md link.
function assertValidDocsSections(configPath, sections) {
  if (!Array.isArray(sections)) {
    throw new Error(`autodocs config at "${configPath}": "docs.sections" must be a list`);
  }
  for (const [index, section] of sections.entries()) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      throw new Error(`autodocs config at "${configPath}": "docs.sections[${index}]" must be an object`);
    }
    assertSafeLabel(section.label, `docs.sections[${index}].label`);
    if (!Array.isArray(section.tours) || section.tours.length === 0) {
      throw new Error(
        `autodocs config at "${configPath}": "docs.sections[${index}].tours" must be a non-empty list of tour ids`,
      );
    }
    for (const tourId of section.tours) {
      if (typeof tourId !== 'string' || !SLUG_RE.test(tourId)) {
        throw new Error(
          `autodocs config at "${configPath}": "docs.sections[${index}].tours" entry "${JSON.stringify(tourId)}" ` +
            `is invalid — must be a lowercase kebab-case tour id`,
        );
      }
    }
  }
}
