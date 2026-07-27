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
import { execFileSync } from 'node:child_process';
import { globSync } from 'glob';
import { computeCodePathsHash } from './drift.mjs';
import { KEEP_END, KEEP_START } from './docgen.mjs';
import { autoFenceCommandLines } from './code-format.mjs';

// Ordered spec for the product-level pages generate-product-docs.mjs can
// produce. Positions start at 1 so these always sort above tour pages, which
// start at 10 (see generate-docs.mjs) — leaving headroom without the two
// numbering schemes needing to coordinate. configuration/troubleshooting/
// changelog are enabled by default like the original three — an ungrounded
// one is simply skipped and reported (see agents/product-scribe.md), never
// padded, so a project with no CHANGELOG.md/troubleshooting section pays
// nothing beyond "skipped" showing up in the run summary.
//
// decisions (position 7, appended rather than interleaved — same "add at
// the tail, don't renumber existing pages" precedent as troubleshooting/
// changelog before it) surfaces human-written architectural decision
// records: never AI-inferred rationale (why a framework/pattern was
// chosen), only decisions someone actually wrote down — see
// collectAdrSources below and agents/product-scribe.md's hard rule for this
// page. Skipped like any other page when there's nothing to ground it in
// (no ADR directory in the project at all), so a project that doesn't use
// this convention pays nothing beyond "skipped" in the run summary.
export const PRODUCT_PAGES = [
  { id: 'overview', title: 'Overview', sidebarLabel: 'Overview', sidebarPosition: 1, includeTourIndex: true },
  { id: 'getting-started', title: 'Getting started', sidebarLabel: 'Getting started', sidebarPosition: 2, includeTourIndex: false },
  { id: 'concepts', title: 'Concepts', sidebarLabel: 'Concepts', sidebarPosition: 3, includeTourIndex: false },
  { id: 'configuration', title: 'Configuration', sidebarLabel: 'Configuration', sidebarPosition: 4, includeTourIndex: false },
  { id: 'troubleshooting', title: 'Troubleshooting', sidebarLabel: 'Troubleshooting', sidebarPosition: 5, includeTourIndex: false },
  { id: 'changelog', title: 'Changelog', sidebarLabel: 'Changelog', sidebarPosition: 6, includeTourIndex: false },
  { id: 'decisions', title: 'Decisions', sidebarLabel: 'Decisions', sidebarPosition: 7, includeTourIndex: false },
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
// needed. CHANGELOG.md is the changelog page's preferred ground truth (see
// listGitTags below for its fallback when this doesn't exist).
const DEFAULT_SOURCES = ['README.md', 'package.json', '.env.example', 'docsolace.config.yaml', 'CHANGELOG.md'];

// Best-effort list of tag names, newest-created first — the changelog
// page's fallback ground truth when a project has no CHANGELOG.md. Unlike
// every other product-page source, a new tag isn't a *file* change
// computeCodePathsHash's git-blob hashing would ever catch on its own —
// that's why computeProductInputsHash below takes it as a separate,
// explicit input rather than folding it into sourceFiles. Falls back to an
// empty list outside a git repo or before any tag exists — same
// "never guess, degrade gracefully" posture as lib/drift.mjs's own
// git-failure fallbacks.
export function listGitTags(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['tag', '--sort=-creatordate'], { cwd, encoding: 'utf8' })
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Glob-noise/safety exclusion for config.product.sources — these directories
// are never meaningfully "about the product" and can be huge (node_modules)
// or hold generated/local state (.git, .docsolace).
const SOURCE_IGNORE = ['**/node_modules/**', '**/.git/**', '**/.docsolace/**'];

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
  // Architecture Decision Records — a well-known convention (docs/adr/*.md,
  // per Michael Nygard's original ADR format), auto-detected the same
  // zero-config way DEFAULT_SOURCES is: included only when a human actually
  // wrote one there. This is the *only* thing that grounds the 'decisions'
  // page (see PRODUCT_PAGES above) — no directory, no page, by design
  // (never an AI-inferred substitute for someone writing down why a
  // decision was made — see agents/product-scribe.md's hard rule for it).
  for (const rel of globSync('docs/adr/*.md', { cwd, nodir: true, ignore: SOURCE_IGNORE })) {
    files.add(rel);
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
//
// `gitTags` (optional — see listGitTags above) is the changelog page's own
// extra dirty signal: pass it only when the changelog page is enabled *and*
// there's no CHANGELOG.md (the caller's job — generate-product-docs.mjs/
// drift.mjs, which both know the enabled page set and can check the file
// exists), so a project not using the changelog page, or one with a real
// CHANGELOG.md already covered by sourceFiles, never pays for an extra git
// call or extra hash churn from tags it doesn't render anything from.
export function computeProductInputsHash({ cwd, sourceFiles, tours, gitTags }) {
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
  if (gitTags !== undefined) {
    hash.update(`gitTags:${JSON.stringify(gitTags)}\n`);
  }
  return hash.digest('hex');
}

// The one "is changelog enabled, and does it need the git-tags fallback"
// check, shared so generate-product-docs.mjs and drift.mjs can't disagree
// about when to pay for the extra git call / fold tags into the hash — both
// must compute computeProductInputsHash's gitTags input identically, or
// drift.mjs's report would drift from what generate-product-docs.mjs
// actually persists. Gated on `enabledPageIds` (config.product.pages, or
// every id by default), not a --page-scoped run's narrower target list —
// the shared inputsHash covers every enabled page regardless of which ones
// a given invocation happens to write.
export function resolveChangelogGitTags({ cwd, enabledPageIds }) {
  if (!enabledPageIds.includes('changelog')) return undefined;
  if (fs.existsSync(path.join(cwd, 'CHANGELOG.md'))) return undefined;
  return listGitTags(cwd);
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

// Looser than MAX_FRONTMATTER_VALUE_LENGTH above — a search-engine/answer-
// engine meta description conventionally runs up to ~155-160 characters
// before truncation, well past what a sidebar label or title should ever
// need. deriveMetaDescription below already truncates to this bound, so in
// practice this is a safety net, not the primary truncation path.
const MAX_DESCRIPTION_LENGTH = 160;

function assertFrontmatterValue(value, label, maxLength = MAX_FRONTMATTER_VALUE_LENGTH) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
}

// Turns a chunk of already-grounded prose (a tour's own `intent`, or
// product-scribe's first written section) into a plain-text, page-specific
// meta description — for a citation snippet in an answer engine (Perplexity/
// ChatGPT/Claude search) or a classic search result to be accurate to *this*
// page, instead of every generated page sharing one site-wide tagline (see
// site/docusaurus.config.js's `tagline`, the fallback Docusaurus uses when a
// page sets no `description` frontmatter).
//
// Deliberately mechanical extraction, not new content: strips markdown
// syntax that would otherwise show up literally inside an HTML <meta>
// attribute (code spans, bold/italic markers, link/image syntax — keeping a
// link's visible text), collapses whitespace, and truncates at a word
// boundary. Never invents or paraphrases; the source text is always either a
// human/tour-scout-authored `intent` or product-scribe's own grounded prose.
//
// Known limitation: the single-`_`/single-`*` italic strip below can
// misfire on a bare snake_case identifier with two underscores in running
// prose (rare in practice — this codebase's real prose wraps identifiers in
// backticks, stripped separately above); accepted rather than a heavier
// markdown parser for what is, worst case, a cosmetic truncation artifact in
// a meta tag.
export function deriveMetaDescription(text, maxLength = MAX_DESCRIPTION_LENGTH) {
  if (typeof text !== 'string') return '';
  let plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images — drop entirely, no visible text to keep
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links — keep the visible text
    .replace(/`([^`]*)`/g, '$1') // code spans
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold (**)
    .replace(/__([^_]+)__/g, '$1') // bold (__)
    .replace(/\*([^*]+)\*/g, '$1') // italic (*)
    .replace(/_([^_]+)_/g, '$1') // italic (_)
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  if (plain.length <= maxLength) return plain;
  const truncated = plain.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

// Serializes a minimal YAML frontmatter block: only these five whitelisted
// keys, ever. Values are JSON-quoted — JSON string syntax is a valid YAML
// flow scalar (same trick bootstrap.mjs's safeYamlBaseUrl uses) — so this
// sidesteps YAML-injection without a bespoke escaping routine.
//
// description (new — see deriveMetaDescription above) maps directly to
// Docusaurus's per-doc `description` frontmatter, which it renders as both
// the page's <meta name="description"> and its og:description, overriding
// the site-wide tagline fallback. Omitted entirely (never emitted empty)
// when the caller has nothing to ground it in, which just means that page
// keeps falling back to the site tagline, same as before this field existed.
//
// lastVerified (opt-in — config.docs.stampVerified, see lib/config.mjs) is
// the caller-formatted "<date> (<short-sha>)" string generate-docs.mjs/
// generate-product-docs.mjs compute from the exact same generatedAt/
// generatedAtCommit values they persist into state.json — one source of
// truth for "when was this last generated", surfaced both on the page itself
// and in `/document status`'s report (lib/status.mjs). It only advances when
// the page is actually regenerated (screenshots/code/inputs changed), never
// on a clean run with nothing to do — bumping it on every run regardless of
// change would mean re-writing every page every time just to touch a
// timestamp, defeating the whole point of the drift gate.
export function buildFrontmatter({ sidebarPosition, sidebarLabel, title, description, lastVerified } = {}) {
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
  // Unlike sidebarLabel/title (always expected to be real, non-empty
  // strings), an empty description is the normal "nothing to ground it in"
  // case — deriveMetaDescription returns '' for that rather than throwing,
  // so it's silently omitted here too, not treated as a caller error.
  if (description) {
    assertFrontmatterValue(description, 'description', MAX_DESCRIPTION_LENGTH);
    lines.push(`description: ${JSON.stringify(description)}`);
  }
  if (lastVerified !== undefined) {
    assertFrontmatterValue(lastVerified, 'last_verified');
    lines.push(`last_verified: ${JSON.stringify(lastVerified)}`);
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

// The `tourInventory` input to lib/design.mjs's computeRenderHash — every
// published tour's {id, title}, sorted by id. Centralized here (rather than
// each of generate-docs.mjs/drift.mjs/status.mjs building it inline) after a
// real bug: two of those three call sites drifted out of sync with a third
// (one still building a plain array of ids after this {id, title} shape was
// introduced), making that script's dirty/clean report permanently disagree
// with what a real run would actually do — confirmed by reproducing it
// against this repo's own tours before centralizing this. A tour's
// sidebar_position (every sibling's existence/order) *and* a prerequisites/
// see_also cross-link's rendered title both depend on the full inventory,
// so title is part of this, not just id — a title-only edit has to mark
// every page linking to that tour dirty too.
export function buildTourInventory(allTours) {
  return (allTours ?? [])
    .filter(isPublishedTour)
    .map((t) => ({ id: t.id, title: t.title ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Resolves a list of tour ids (a tour's own prerequisites/see_also — see
// lib/tours.mjs) against the live tour inventory into {id, title} pairs for
// lib/docgen.mjs's renderTourPage cross-link blocks. Silently drops a
// dangling or unpublished id rather than throwing — lib/validate.mjs is
// where that's reported as a real finding (error for dangling, warn for
// unpublished); generation should still produce a correct page from
// whatever's valid instead of failing the whole run over one bad link. A
// tour with no title falls back to its id, same as the product page's own
// tour index (renderProductPage's tourIndex, in generate-product-docs.mjs)
// already does.
export function resolveTourLinks(ids, allTours) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const byId = new Map(allTours.map((t) => [t.id, t]));
  return ids
    .map((id) => byId.get(id))
    .filter((t) => t && isPublishedTour(t))
    .map((t) => ({ id: t.id, title: t.title ?? t.id }));
}

// Assembles one product page: frontmatter, heading, product-scribe's grounded
// sections, an optional linked tour index (overview only), then the single
// keep-region every generated page carries — reusing docgen.mjs's exact
// markers so applyKeepRegion/nonKeepContent (also reused as-is by
// generate-product-docs.mjs, not forked) treat these pages identically to
// tour pages.
export function renderProductPage({ page, prose, tourIndex, keepRegionPlaceholder, frontmatter }) {
  // autoFenceCommandLines is a safety net, not the primary fix (that's
  // product-scribe's own hard rule — see agents/product-scribe.md) — it
  // only catches the one confirmed failure shape (bare, unfenced command
  // lines that CommonMark would otherwise merge into a run-on paragraph),
  // never touching prose that already reads fine. See lib/code-format.mjs.
  const sections = (prose?.sections ?? []).map(
    (section) => `## ${section.heading}\n\n${autoFenceCommandLines(section.body)}`,
  );

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
