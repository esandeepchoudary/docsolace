// Detects whether the project (or the user's own Claude Code setup) already
// has a design/brand skill installed, and turns its distilled output into
// validated page-layout knobs for lib/docgen.mjs. Presentation only — see
// CLAUDE.md's "Scope guardrail": this never touches what doc-scribe writes,
// only how generate-docs.mjs lays a page out and how the Docusaurus site is
// themed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { globSync } from 'glob';
import { parseFrontmatter } from './frontmatter.mjs';

// Keywords that suggest a skill governs visual presentation rather than
// something else entirely (a coding-style skill, a deploy skill, ...).
// Matched against the skill's own name + description, case-insensitively —
// deliberately loose (a real brand skill's description reliably mentions at
// least one of these) rather than tied to one vendor's vocabulary.
const DESIGN_KEYWORDS = [
  'brand',
  'branding',
  'design system',
  'style guide',
  'styleguide',
  'visual identity',
  'color palette',
  'colour palette',
  'typography',
  'logo',
  'ui kit',
  'design language',
  'theme',
  'theming',
];

// `**/skills/*/SKILL.md` (not a fixed depth) because installed plugins nest
// under a marketplace + version directory (e.g.
// `<home>/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md`)
// — verified against this machine's own `~/.claude/plugins/cache/` layout,
// not assumed.
const SKILL_GLOB_PATTERNS = ['.claude/skills/*/SKILL.md', '.claude/plugins/**/skills/*/SKILL.md'];

function scoreDesignRelevance(name, description) {
  const haystack = `${name} ${description}`.toLowerCase();
  let score = 0;
  for (const keyword of DESIGN_KEYWORDS) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

// Both projectDir and homeDir are fixed, trusted roots (the project's own
// checkout, the current user's home) — globSync only ever descends from
// there, so this isn't traversing anything an untrusted input could redirect.
function collectCandidates(baseDir, scope) {
  const results = [];
  if (!baseDir || !fs.existsSync(baseDir)) return results;
  for (const pattern of SKILL_GLOB_PATTERNS) {
    for (const relPath of globSync(pattern, { cwd: baseDir, nodir: true })) {
      const absPath = path.join(baseDir, relPath);
      let raw;
      try {
        raw = fs.readFileSync(absPath, 'utf8');
      } catch {
        continue;
      }
      let frontmatter;
      try {
        ({ frontmatter } = parseFrontmatter(raw));
      } catch {
        continue;
      }
      const name = typeof frontmatter?.name === 'string' && frontmatter.name ? frontmatter.name : path.basename(path.dirname(absPath));
      const description = typeof frontmatter?.description === 'string' ? frontmatter.description : '';
      const score = scoreDesignRelevance(name, description);
      if (score > 0) {
        results.push({ name, scope, path: absPath, description, score });
      }
    }
  }
  return results;
}

// Ranks project-scoped candidates above every user-scoped one, regardless of
// keyword score — a project that ships its own brand skill means that one,
// not whatever happens to be installed globally. Within a scope, higher
// keyword score first; ties keep glob (directory) order, which is stable.
function rank(candidate) {
  return (candidate.scope === 'project' ? 1000 : 0) + candidate.score;
}

// Returns design-skill candidates found under the project and/or the user's
// home directory, ranked best-first. Never reads a parent directory's
// CLAUDE.md or any file outside these two roots — CLAUDE.md is explicit that
// a project can opt out of an ambient parent brand, and auto-inheriting one
// here would defeat that.
export function discoverDesignSkills({ projectDir, homeDir } = {}) {
  const candidates = [...collectCandidates(projectDir, 'project'), ...collectCandidates(homeDir, 'user')];
  return candidates.sort((a, b) => rank(b) - rank(a)).map(({ score: _score, ...candidate }) => candidate);
}

const DOC_STYLE_FILENAME = path.join('.autodocs', 'doc-style.json');
// Deliberately conservative: a style value only ever needs to be a short,
// plain label. Rejecting markdown/HTML metacharacters and newlines means a
// hand-edited (or tampered) doc-style.json can't inject markup, break the
// generated page's structure, or smuggle multi-line content into what's
// otherwise a one-line summary — same untrusted-config-input posture
// CLAUDE.md asks for everywhere else config feeds into something rendered.
const UNSAFE_LABEL_CHARS_RE = /[<>[\]()|\r\n]/;
const MAX_LABEL_LENGTH = 60;
const VIEWPORT_KEY_RE = /^[a-z0-9-]+$/;
// A capture step's highlight (see lib/tours.mjs) gets outlined in the
// *actual screenshot pixels* capture.mjs takes — the one place this
// codebase lets doc-style.json reach past markdown presentation into what a
// browser renders. That raw value is injected verbatim into a live page's
// `<style>` tag (capture.mjs's addStyleTag), a categorically more sensitive
// embedding than assertSafeLabel's markdown/HTML-metacharacter bar below —
// a free-form string there could break out of the intended CSS rule
// entirely (e.g. "red; } body { display:none } /*"). Restricted to exactly
// a 3- or 6-digit hex color, nothing else.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Exported so other generated-content producers (lib/product.mjs's
// frontmatter/section labels) can reuse this exact bar instead of forking a
// slightly different one — same conservative "short plain label, no
// markdown/HTML metacharacters" posture applies anywhere untrusted config
// content reaches a generated page.
export function assertSafeLabel(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${DOC_STYLE_FILENAME}: "${label}" must be a non-empty string`);
  }
  if (value.length > MAX_LABEL_LENGTH) {
    throw new Error(`${DOC_STYLE_FILENAME}: "${label}" must be ${MAX_LABEL_LENGTH} characters or fewer`);
  }
  if (UNSAFE_LABEL_CHARS_RE.test(value)) {
    throw new Error(`${DOC_STYLE_FILENAME}: "${label}" must not contain markdown/HTML metacharacters or newlines`);
  }
}

// Loads and strictly validates the `page` section of .autodocs/doc-style.json
// (written by the /document skill after applying a detected design skill —
// see plugin/skills/document/SKILL.md's "Apply the project's design skill").
// Returns {} when the file doesn't exist, so every caller behaves exactly as
// it did before this feature existed. The `site` section (free-form
// Docusaurus theming notes) is intentionally never read here — it's consumed
// only by the prompt-driven "Scaffold a docs site" step (init-site is
// idempotent: re-running it on an already-scaffolded site re-applies
// styling instead of a separate mode), never by a script that feeds output
// into a generated markdown page.
export function loadDocStyle(projectDir) {
  const stylePath = path.join(projectDir, DOC_STYLE_FILENAME);
  if (!fs.existsSync(stylePath)) return {};

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(stylePath, 'utf8'));
  } catch (err) {
    throw new Error(`${DOC_STYLE_FILENAME} is not valid JSON (${err.message})`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${DOC_STYLE_FILENAME} must be a JSON object`);
  }

  const page = raw.page;
  if (page === undefined) return { skill: typeof raw.skill === 'string' ? raw.skill : undefined };
  if (typeof page !== 'object' || page === null || Array.isArray(page)) {
    throw new Error(`${DOC_STYLE_FILENAME}: "page" must be an object`);
  }

  const style = {};
  if (page.stepsHeading !== undefined) {
    assertSafeLabel(page.stepsHeading, 'page.stepsHeading');
    style.stepsHeading = page.stepsHeading;
  }
  if (page.viewportLabels !== undefined) {
    if (typeof page.viewportLabels !== 'object' || page.viewportLabels === null || Array.isArray(page.viewportLabels)) {
      throw new Error(`${DOC_STYLE_FILENAME}: "page.viewportLabels" must be an object`);
    }
    const viewportLabels = {};
    for (const [key, value] of Object.entries(page.viewportLabels)) {
      if (!VIEWPORT_KEY_RE.test(key)) {
        throw new Error(
          `${DOC_STYLE_FILENAME}: "page.viewportLabels" key "${key}" is invalid — must be lowercase ` +
            `letters, digits, and hyphens only`,
        );
      }
      assertSafeLabel(value, `page.viewportLabels.${key}`);
      viewportLabels[key] = value;
    }
    style.viewportLabels = viewportLabels;
  }
  if (page.figures !== undefined) {
    if (typeof page.figures !== 'boolean') {
      throw new Error(`${DOC_STYLE_FILENAME}: "page.figures" must be a boolean`);
    }
    style.figures = page.figures;
  }
  if (page.highlightColor !== undefined) {
    if (typeof page.highlightColor !== 'string' || !HEX_COLOR_RE.test(page.highlightColor)) {
      throw new Error(
        `${DOC_STYLE_FILENAME}: "page.highlightColor" must be a 3- or 6-digit hex color (e.g. "#FF3B30")`,
      );
    }
    style.highlightColor = page.highlightColor;
  }

  return { skill: typeof raw.skill === 'string' ? raw.skill : undefined, page: style };
}

// A stable hash over everything that changes renderTourPage's *output shape*
// for a given tour, independent of that tour's own screenshots/code_paths —
// folded into the drift gate (lib/drift.mjs's isTourDirty) so a template or
// style change re-renders every existing page on the next run instead of
// waiting for that tour's own content to change first.
//
// `tourInventory` is optional (existing callers that predate tour
// sidebar_position frontmatter keep working unchanged) — pass the sorted
// list of every *other* published tour id when calling this for a tour page.
// A tour's sidebar_position depends on where every sibling tour sorts (see
// lib/product.mjs's computeTourSidebarPositions), not just docsConfig/
// pageStyle in isolation, so adding/removing/renaming a tour anywhere in the
// project has to re-render every tour page's frontmatter too, not just the
// one that actually changed.
export function computeRenderHash({ templateVersion, docsConfig, pageStyle, tourInventory }) {
  const hash = createHash('sha256');
  hash.update(`template:${templateVersion}\n`);
  hash.update(`docsConfig:${JSON.stringify(docsConfig ?? {})}\n`);
  if (tourInventory !== undefined) {
    hash.update(`tourInventory:${JSON.stringify(tourInventory)}\n`);
  }
  hash.update(`pageStyle:${JSON.stringify(pageStyle ?? {})}\n`);
  return hash.digest('hex');
}
