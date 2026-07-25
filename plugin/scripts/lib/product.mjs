// Pure helpers for the product-documentation layer: overview/getting-started/
// concepts pages that describe the *product*, sitting above the per-tour
// tutorial pages lib/docgen.mjs renders. Same split as everywhere else in
// this codebase — pure, unit-testable logic here; the actual fs mutation
// lives in scripts/generate-product-docs.mjs.
//
// Ground truth for these pages is the repo itself (README, package.json,
// tour inventory, project source), never the browser — see
// agents/product-scribe.md. That's a different trust boundary than
// doc-scribe's a11y-snapshot grounding, so this file owns its own "what's
// safe to hand a subagent to Read" allow/deny logic rather than reusing
// doc-scribe's.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { globSync } from 'glob';
import { computeCodePathsHash } from './drift.mjs';
import { KEEP_END, KEEP_START } from './docgen.mjs';

// Ordered spec for the product-level pages generate-product-docs.mjs can
// produce. Positions start at 1 so these always sort above tour pages, which
// start at 10 (see generate-docs.mjs) — leaving headroom without the two
// numbering schemes needing to coordinate.
export const PRODUCT_PAGES = [
  { id: 'overview', title: 'Overview', sidebarLabel: 'Overview', sidebarPosition: 1, includeTourIndex: true },
  { id: 'getting-started', title: 'Getting started', sidebarLabel: 'Getting started', sidebarPosition: 2, includeTourIndex: false },
  { id: 'concepts', title: 'Concepts', sidebarLabel: 'Concepts', sidebarPosition: 3, includeTourIndex: false },
];

export const PRODUCT_PAGE_IDS = PRODUCT_PAGES.map((p) => p.id);

// Reserved manifest/state key for the product pages' own drift-tracking
// entry. tours.mjs's SLUG_RE requires a tour id to start with a lowercase
// letter/digit, so a leading underscore can never collide with a real one.
export const PRODUCT_STATE_KEY = '_product';

// Files handed to product-scribe are read straight into a subagent's context
// and distilled into prose describing the product — never a live secret, a
// session cookie, or a private key, no matter what a project's own
// `product.sources` glob happens to match (that's untrusted config, per
// CLAUDE.md's SSDLC section, and could target these paths explicitly or via
// something broad like "**/*"). Denied outright, not just "absent from the
// default list": the whole `.env*` family except `.env.example` (which
// documents required config without holding live values — `.env.local`,
// `.env.production.local`, etc. are the ones dotenv-based tooling actually
// keeps real secrets in, and a bare "$" anchor on `.env` alone missed all of
// them), private-key-shaped extensions, and anything under a `.auth/`
// directory (capture.mjs's saved session-cookie storageStatePath files land
// there). Checked against the file's basename, not the full relative path,
// so it can't be evaded by nesting (e.g. "nested/.env.local").
function isDeniedSource(relPath) {
  const base = path.basename(relPath);
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return true;
  if (/\.(pem|key|p12|pfx)$/.test(base)) return true;
  if (/(^|\/)\.auth\//.test(relPath)) return true;
  return false;
}

// Standing "what does this project say about itself" documents, included
// whenever they actually exist — the common case for any project, no config
// needed.
const DEFAULT_SOURCES = ['README.md', 'package.json', '.env.example', 'autodocs.config.yaml'];

// Glob-noise/safety exclusion for config.product.sources — these directories
// are never meaningfully "about the product" and can be huge (node_modules)
// or hold generated/local state (.git, .autodocs).
const SOURCE_IGNORE = ['**/node_modules/**', '**/.git/**', '**/.autodocs/**'];

// True when `rel` (relative to `cwd`) resolves — after following any
// symlinks — to a real path still inside `cwd`. Two escapes this closes that
// lib/config.mjs's assertValidProductConfig alone can't:
// (1) brace expansion: a pattern like "{..,x}/*secret*" contains no path
// segment that is literally "..", so the config-load-time string check
// passes, but glob's default brace expansion still turns it into a real
// "../*secret*" match — closed by resolving the *matched* path here, not
// just validating the *pattern* string, and by passing `nobrace: true` to
// globSync below as the primary defense.
// (2) symlinks: a tracked symlink whose target is outside the project (or
// one of the DEFAULT_SOURCES names, e.g. README.md, committed as a symlink)
// reads through to wherever it actually points, regardless of how safe its
// in-repo path looks — fs.realpathSync follows the link so the check sees
// the real destination, not the innocent-looking source path.
function isWithinRoot(cwd, rel) {
  let resolvedRoot;
  let resolvedTarget;
  try {
    resolvedRoot = fs.realpathSync(cwd);
    resolvedTarget = fs.realpathSync(path.join(cwd, rel));
  } catch {
    return false; // broken symlink or a path that vanished mid-run — exclude, don't guess.
  }
  const relFromRoot = path.relative(resolvedRoot, resolvedTarget);
  return relFromRoot !== '' && relFromRoot !== '..' && !relFromRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(relFromRoot);
}

// Resolves the grounding file list product-scribe is allowed to Read: the
// standing docs above (only the ones that exist) plus config.product.sources
// globs — already constrained to safe, relative, non-".." *pattern strings*
// by lib/config.mjs's assertValidProductConfig, and re-confined here against
// the actual *resolved* path (see isWithinRoot) since a pattern string
// passing validation doesn't guarantee every path it expands/resolves to
// does too (brace expansion, symlinks) — deduplicated, sorted, and filtered
// through the deny list above as defense-in-depth even on top of both.
export function collectProductSources(cwd, config) {
  const files = new Set();
  for (const rel of DEFAULT_SOURCES) {
    if (fs.existsSync(path.join(cwd, rel))) files.add(rel);
  }
  for (const pattern of config?.product?.sources ?? []) {
    // nobrace: true — brace expansion (e.g. "{..,x}/*") is not a feature
    // legitimate project-relative globs here need, and letting it expand
    // arbitrary alternatives is exactly what lets a pattern's *string* pass
    // lib/config.mjs's "no literal .. segment" check while still resolving
    // outside the project root once glob expands it.
    for (const rel of globSync(pattern, { cwd, nodir: true, ignore: SOURCE_IGNORE, nobrace: true })) {
      files.add(rel);
    }
  }
  return [...files]
    .filter((rel) => isWithinRoot(cwd, rel))
    .filter((rel) => !isDeniedSource(rel))
    .sort();
}

// A stable hash over everything that should mark the product pages dirty:
// the committed content of every grounding file (reusing lib/drift.mjs's
// computeCodePathsHash — each already-resolved file path glob-matches only
// itself) plus a summary of the confirmed tour inventory, so adding,
// renaming, retitling, or archiving a tour marks the pages dirty too, not
// just an edit to README.md.
export function computeProductInputsHash({ cwd, sourceFiles, tours }) {
  const sourcesHash = computeCodePathsHash(sourceFiles, cwd);
  const tourSummary = (tours ?? [])
    .map((t) => ({
      id: t.id,
      title: t.title ?? null,
      intent: t.intent ?? null,
      status: t.status ?? null,
      maturity: t.maturity ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash('sha256');
  hash.update(`sources:${sourcesHash}\n`);
  hash.update(`tours:${JSON.stringify(tourSummary)}\n`);
  return hash.digest('hex');
}

// Same shape as lib/drift.mjs's getDirtyReasons, simplified: the product
// pages have no screenshots to hash, just their grounding-file/tour-inventory
// inputs hash and the shared render hash (template/docs-layout/design-style
// — lib/design.mjs's computeRenderHash). No maturity/status gate here since,
// unlike a tour, the product pages have no draft/proposed/archived concept
// of their own. Returns a subset of ['never-generated', 'inputs', 'render'];
// empty when clean.
export function getProductDirtyReasons({ previousEntry, currentInputsHash, currentRenderHash }) {
  if (!previousEntry) return ['never-generated'];
  const reasons = [];
  if (previousEntry.inputsHash !== currentInputsHash) reasons.push('inputs');
  if (previousEntry.renderHash !== currentRenderHash) reasons.push('render');
  return reasons;
}

export function isProductDirty(args) {
  return getProductDirtyReasons(args).length > 0;
}

// True when the product pages are dirty *only* because of a render/layout/
// style change — their grounding inputs are unchanged, so whatever prose
// product-scribe already wrote is still grounded and doesn't need
// re-authoring, same "render-only" shortcut lib/drift.mjs's
// isRenderOnlyDirty gives tours.
export function isProductRenderOnlyDirty(reasons) {
  return reasons.length > 0 && reasons.every((r) => r === 'render');
}

// A tour's own title (unlike design.mjs's doc-style.json labels) is free-form
// prose an author wrote for humans — it can reasonably contain punctuation
// like parentheses that lib/design.mjs's assertSafeLabel rejects, since that
// check exists for a different embedding context: a value interpolated
// unescaped into a raw HTML block (docgen.mjs's <details>/<summary> lines).
// Here the value is JSON-quoted (see buildFrontmatter below) — JSON string
// syntax already escapes quotes/backslashes/control characters/newlines into
// a single-line, syntactically valid YAML flow scalar no matter what the
// input contains, and Docusaurus renders both sidebar_label and title as
// plain React text, not raw HTML — so the only thing actually worth
// enforcing here is "a real, boundedly-sized string".
const MAX_FRONTMATTER_VALUE_LENGTH = 100;

function assertFrontmatterValue(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.length > MAX_FRONTMATTER_VALUE_LENGTH) {
    throw new Error(`${label} must be ${MAX_FRONTMATTER_VALUE_LENGTH} characters or fewer`);
  }
}

// Serializes a minimal YAML frontmatter block: only these three whitelisted
// keys, ever. Values are JSON-quoted — JSON string syntax is a valid YAML
// flow scalar (same trick bootstrap.mjs's safeYamlBaseUrl uses) — so this
// sidesteps YAML-injection without a bespoke escaping routine.
export function buildFrontmatter({ sidebarPosition, sidebarLabel, title } = {}) {
  const lines = ['---'];
  if (sidebarPosition !== undefined) {
    if (typeof sidebarPosition !== 'number' || !Number.isFinite(sidebarPosition)) {
      throw new Error(`sidebar_position must be a finite number, got ${JSON.stringify(sidebarPosition)}`);
    }
    lines.push(`sidebar_position: ${sidebarPosition}`);
  }
  if (sidebarLabel !== undefined) {
    assertFrontmatterValue(sidebarLabel, 'sidebar_label');
    lines.push(`sidebar_label: ${JSON.stringify(sidebarLabel)}`);
  }
  if (title !== undefined) {
    assertFrontmatterValue(title, 'title');
    lines.push(`title: ${JSON.stringify(title)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

// True for exactly the tours that end up with a real docs/<id>.md page —
// same skip conditions generate-docs.mjs/lib/drift.mjs's isTourDirty already
// use (maturity: draft, status: proposed, status: archived all mean "no
// page"), kept here as one shared predicate so the overview page's tour
// index and buildSidebarStructure below can't quietly disagree with each
// other — or with generate-docs.mjs itself — about which tours are "real".
export function isPublishedTour(tour) {
  return tour.maturity !== 'draft' && tour.status !== 'proposed' && tour.status !== 'archived';
}

// Assembles one product page: frontmatter, heading, product-scribe's grounded
// sections, an optional linked tour index (overview only), then the single
// keep-region every generated page carries — reusing docgen.mjs's exact
// markers so applyKeepRegion/nonKeepContent (also reused as-is by
// generate-product-docs.mjs, not forked) treat these pages identically to
// tour pages.
export function renderProductPage({ page, prose, tourIndex, keepRegionPlaceholder, frontmatter }) {
  const sections = (prose?.sections ?? []).map((section) => `## ${section.heading}\n\n${section.body}`);

  const indexLines =
    tourIndex && tourIndex.length > 0
      ? [
          '## Tutorials',
          '',
          ...tourIndex.map((t) => `- [${t.title}](${t.id}.md)${t.intent ? ` — ${t.intent}` : ''}`),
          '',
        ]
      : [];

  const body = [
    `# ${page.title}`,
    '',
    sections.join('\n\n'),
    '',
    ...indexLines,
    KEEP_START,
    keepRegionPlaceholder ?? '<!-- Notes added here are preserved across regeneration. -->',
    KEEP_END,
    '',
  ].join('\n');

  // Same "only prepend when actually given" shape as renderTourPage — a page
  // with no frontmatter (e.g. this feature applied to a project predating
  // it) renders exactly as it would have before frontmatter support existed,
  // no stray leading blank line.
  return frontmatter ? `${frontmatter}\n${body}` : body;
}

// Tour pages sort after every product page (positions 1-3 — see
// PRODUCT_PAGES) and start at 10, leaving headroom between the two numbering
// schemes without them needing to coordinate.
const TOUR_SIDEBAR_POSITION_BASE = 10;

// One sidebar_position per published tour (see isPublishedTour — a draft/
// proposed/archived tour has no generated page, so it gets no position),
// ordered exactly the way buildSidebarStructure below would group them:
// docs.sections in config order first, then every unsectioned tour
// alphabetically. Used by generate-docs.mjs so a tour's own frontmatter
// always agrees with the sidebar file's ordering — computed independently
// they could drift apart on a future edit to either function.
export function computeTourSidebarPositions({ sections, tours }) {
  const structure = buildSidebarStructure({ pages: [], sections, tours });
  const orderedIds = [...structure.sections.flatMap((s) => s.tours), ...structure.unsectionedTours];
  return new Map(orderedIds.map((id, index) => [id, TOUR_SIDEBAR_POSITION_BASE + index]));
}

// The framework-neutral payload init-site wires site/sidebars.js to build a
// real ordered sidebar from, instead of the default alphabetical
// autogenerated one. Product pages always sort first, in PRODUCT_PAGES
// order; tours are grouped into config.docs.sections when a project opts in
// (already-validated labels/slugs — see lib/config.mjs's
// assertValidDocsConfig), else left as one flat "everything else" group so
// this degrades gracefully to "just the product pages pinned on top".
// Archived/proposed tours are never included — they're not real reading
// material yet (proposed) or intentionally filed under docs/archive/ instead
// (archived).
export function buildSidebarStructure({ pages, sections, tours }) {
  const confirmedTourIds = new Set((tours ?? []).filter(isPublishedTour).map((t) => t.id));

  const sectioned = new Set();
  const builtSections = (sections ?? []).map((section) => {
    const tourIds = (section.tours ?? []).filter((id) => confirmedTourIds.has(id));
    tourIds.forEach((id) => sectioned.add(id));
    return { label: section.label, tours: tourIds };
  });

  const unsectionedTours = [...confirmedTourIds].filter((id) => !sectioned.has(id)).sort();

  return {
    productPages: (pages ?? []).map((p) => p.id),
    sections: builtSections,
    unsectionedTours,
  };
}
