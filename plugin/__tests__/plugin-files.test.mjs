import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseToolList } from '../scripts/lib/frontmatter.mjs';

const pluginRoot = path.join(import.meta.dirname, '..');

describe('plugin.json', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'),
  );

  it('has a kebab-case name and a description', () => {
    expect(manifest.name).toBe('autodocs');
    expect(manifest.description?.length).toBeGreaterThan(0);
  });

  it('has an explicit semver version, so updates require bumping it', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('package.json (bundled runtime deps)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));

  it('lists the runtime deps the bundled scripts actually import', () => {
    for (const dep of ['playwright', 'js-yaml', 'pixelmatch', 'pngjs', 'glob']) {
      expect(pkg.dependencies).toHaveProperty(dep);
    }
  });

  it('has no devDependencies — this manifest only ever gets `npm install`ed, never developed against', () => {
    expect(pkg.devDependencies).toBeUndefined();
  });
});

describe('hooks/hooks.json', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks/hooks.json'), 'utf8'));
  const command = hooks.hooks.SessionStart[0].hooks[0].command;

  it('has a second SessionStart entry that emits the standing session-guidance context', () => {
    const guidanceCommand = hooks.hooks.SessionStart[1].hooks[0].command;
    expect(guidanceCommand).toContain('${CLAUDE_PLUGIN_ROOT}/scripts/session-guidance.mjs');
    // Runs from PLUGIN_ROOT, not PLUGIN_DATA — it has no third-party deps, so
    // it must not depend on the first hook's npm install having finished.
    expect(guidanceCommand).not.toContain('CLAUDE_PLUGIN_DATA');
  });

  it('guards the second SessionStart entry against CLAUDE_PLUGIN_ROOT being unset too', () => {
    // An unset var would otherwise interpolate to empty and surface as an
    // opaque node "Cannot find module" error instead of a clear message
    // naming the actual problem — same guard shape the first hook already
    // has for both its vars.
    const guidanceCommand = hooks.hooks.SessionStart[1].hooks[0].command;
    expect(guidanceCommand).toMatch(/CLAUDE_PLUGIN_ROOT:\?/);
    expect(guidanceCommand.indexOf('CLAUDE_PLUGIN_ROOT:?')).toBeLessThan(guidanceCommand.indexOf('node '));
  });

  it('installs bundled deps into CLAUDE_PLUGIN_DATA, never CLAUDE_PLUGIN_ROOT', () => {
    expect(command).toContain('${CLAUDE_PLUGIN_DATA}');
    expect(command).toContain('npm install');
  });

  it('copies scripts into the data dir so they sit next to node_modules (ESM needs a sibling, not NODE_PATH)', () => {
    expect(command).toContain('cp -r "${CLAUDE_PLUGIN_ROOT}/scripts" "${CLAUDE_PLUGIN_DATA}/scripts"');
  });

  it('only reinstalls when the bundled manifest actually changed (diff-gated)', () => {
    expect(command).toContain('diff -q');
    expect(command).toContain('package.json');
  });

  it('also installs the Playwright browser the capture runner needs', () => {
    expect(command).toContain('playwright install chromium');
  });

  it('guards against CLAUDE_PLUGIN_DATA/CLAUDE_PLUGIN_ROOT being unset before any rm -rf', () => {
    expect(command).toMatch(/CLAUDE_PLUGIN_DATA:\?/);
    expect(command).toMatch(/CLAUDE_PLUGIN_ROOT:\?/);
    // The guards must run before the destructive rm -rf, not after.
    expect(command.indexOf('CLAUDE_PLUGIN_DATA:?')).toBeLessThan(command.indexOf('rm -rf'));
  });
});

describe('.mcp.json (bundled, project-scoped)', () => {
  const mcp = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  it('declares the playwright server tour-scout depends on', () => {
    expect(mcp.mcpServers).toHaveProperty('playwright');
  });
});

describe('.claude-plugin/marketplace.json (repo root)', () => {
  const marketplaceRoot = path.join(pluginRoot, '..');
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(marketplaceRoot, '.claude-plugin/marketplace.json'), 'utf8'),
  );

  it('has the required name/owner/plugins fields and a description', () => {
    expect(marketplace.name?.length).toBeGreaterThan(0);
    expect(marketplace.description?.length).toBeGreaterThan(0);
    expect(marketplace.owner?.name?.length).toBeGreaterThan(0);
    expect(Array.isArray(marketplace.plugins)).toBe(true);
  });

  it('lists the plugin with a relative source pointing at ./plugin', () => {
    const entry = marketplace.plugins.find((p) => p.name === 'autodocs');
    expect(entry).toBeTruthy();
    expect(entry.source).toBe('./plugin');
  });
});

describe('skills/document/SKILL.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'skills/document/SKILL.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "document" and documents its tour-id argument', () => {
    expect(frontmatter.name).toBe('document');
    expect(frontmatter['argument-hint']).toBeTruthy();
    expect(body).toContain('$ARGUMENTS');
  });

  it('pre-approves the git/gh/node/Edit/Read/Write/Skill surface the autonomous ship + styling steps need', () => {
    // capture/drift/generate-docs/review-diffs/design-scan run via
    // node "${CLAUDE_PLUGIN_DATA}/scripts/*.mjs" — a specific per-script
    // pattern can't be used here because CLAUDE_PLUGIN_DATA isn't
    // substituted in allowed-tools (only CLAUDE_SKILL_DIR/CLAUDE_PROJECT_DIR
    // are), so the widened Bash(node *) is the only pattern that actually
    // matches. Bash(git *)/Bash(gh pr *) cover the Ship step's branch/commit/
    // push/PR commands; Edit covers the targeted status/maturity flip on a
    // proposed tour and site theme edits. Read/Write cover distilling a
    // detected design skill into .autodocs/doc-style.json (see "Apply the
    // project's design skill"); Skill invokes that detected skill. This is
    // broader than before autonomy existed — Claude itself is still the one
    // constructing every command, but this is the surface a security review
    // should scrutinize (see CLAUDE.md's SSDLC section).
    const tools = parseToolList(frontmatter['allowed-tools']);
    expect(tools).toEqual(['Bash(git *)', 'Bash(gh pr *)', 'Bash(node *)', 'Edit', 'Read', 'Write', 'Skill']);
  });

  it('bootstraps autodocs.config.yaml/tours in a project on first use', () => {
    expect(body).toContain('autodocs.config.yaml');
    expect(body.toLowerCase()).toContain('bootstrap');
    expect(body).toContain('tours/');
  });

  it('resumes a bootstrap interrupted before tours/ was created, not just a missing config', () => {
    // init-project.mjs is idempotent per-artifact (see its own robustness
    // fix) — this pins that Step 0 actually takes advantage of that instead
    // of only gating on config existence, which would silently strand a
    // half-bootstrapped project forever (config written, tours/ never
    // created, and the old gate would never re-invoke the script).
    // Whitespace-tolerant: this phrase legitimately wraps across a line in
    // the 80-col-wrapped markdown source (same convention as other tests in
    // this file, e.g. the map-mode "don't draft all of them" assertion).
    expect(body).toMatch(/it\s+exists but `\$\{CLAUDE_PROJECT_DIR\}\/tours\/` doesn't/);
    expect(body.toLowerCase()).toContain('interrupted');
    expect(body).toContain('[--base-url <url>]');
  });

  it('checks gh auth status before Step 1, not only right before Ship', () => {
    // gh pr create is the last thing a run does; checking early means a
    // missing/unauthenticated gh is caught before capture/generate work
    // runs, not only after it all already succeeded.
    const ghCheckIndex = body.indexOf('gh auth status');
    const step1Index = body.indexOf('1. **Capture.**');
    expect(ghCheckIndex).toBeGreaterThan(-1);
    expect(step1Index).toBeGreaterThan(-1);
    expect(ghCheckIndex).toBeLessThan(step1Index);
    expect(body).toContain('gh auth login');
    // Never needed in --review mode, since that mode never reaches Ship in
    // the same invocation.
    expect(body).toMatch(/Unless this run is in `--review` mode.*gh auth status/s);
  });

  it("invokes the AutoDocs pipeline from the plugin's data directory, not via npm run", () => {
    expect(body).toContain('${CLAUDE_PLUGIN_DATA}/scripts/');
    // "npm run build" is legitimate here — it's the *scaffolded site's own*
    // build script (see "Scaffold a docs site"), not the AutoDocs pipeline.
    expect(body).not.toMatch(/npm run (capture|drift|generate-docs)\b/);
  });

  it('delegates prose generation to the doc-scribe subagent, not itself', () => {
    expect(body).toContain('doc-scribe');
    expect(body.toLowerCase()).toContain('never hand-write');
  });

  it('delegates tour drafting to the tour-scout subagent, and auto-confirms by default unless a hard stop fires', () => {
    expect(body).toContain('tour-scout');
    expect(body).toContain('draft the tour yourself');
    expect(body).toContain('status');
    expect(body).toContain('confirmed');
    // Autonomous mode confirms the draft itself (targeted status/maturity
    // edit) instead of always waiting on a human; --review restores the old
    // stop-and-ask behavior.
    expect(body).toContain('--review');
    expect(body.toLowerCase()).toContain('hard stop');
    // Whitespace-tolerant: this phrase legitimately wraps across a line in
    // the 80-col-wrapped markdown source.
    expect(body).toMatch(/status: proposed`\s*→\s*`status: confirmed`/);
  });

  it('ships an opened docs PR by default but never merges it', () => {
    expect(body).toContain('Ship');
    expect(body.toLowerCase()).toMatch(/gh pr\s+create/);
    expect(body.toLowerCase()).toContain('never merge');
    expect(body).toContain('feat/*');
  });

  it('has an init-site mode that encodes the verified markdown.format fix', () => {
    expect(frontmatter['argument-hint']).toContain('init-site');
    expect(body).toContain('init-site');
    // The non-obvious bug this codifies: Docusaurus's default MDX parser
    // fails on the <!-- autodocs:keep --> comments generate-docs.mjs
    // writes. Losing this line from the recipe silently breaks the site.
    expect(body).toContain("markdown: { format: 'md' }");
    expect(body.toLowerCase()).toContain('not optional');
  });

  it('scaffolds the site to read docs/ directly, not a copy', () => {
    expect(body).toContain("docs.path: '../docs'");
  });

  it('init-site wires up self-contained local search, not Algolia (no external account needed)', () => {
    expect(body).toContain('@easyops-cn/docusaurus-search-local');
    expect(body.toLowerCase()).toContain('not optional');
    // The non-obvious mistake this codifies: docsRouteBasePath must be left
    // unset (it defaults to /docs, matching the docs plugin's own route) —
    // setting it to '/' silently breaks every search-result link, caught by
    // actually building and checking search-index.json's URLs.
    expect(body).toContain('docsRouteBasePath');
    expect(body).toContain('search-index.json');
    expect(body.toLowerCase()).toContain('algolia');
  });

  it('backfills search on a restyle run of a site scaffolded before search existed, unconditionally', () => {
    // Search is a capability, not a style — must not be gated behind
    // --no-style the way theme/logo/font application is.
    expect(body.toLowerCase()).toContain('backfill search');
    expect(body.toLowerCase()).toContain('unconditionally');
  });

  it('init-site is idempotent — re-running it on an existing site restyles instead of refusing, no separate restyle mode', () => {
    // restyle used to be its own top-level mode; folded into init-site so
    // there's one fewer thing to remember (see plugin/scripts/lib/design.mjs's
    // loadDocStyle comment, which points back at this same section).
    expect(frontmatter['argument-hint']).not.toContain('restyle');
    expect(body).not.toContain('## Restyle');
    expect(body.toLowerCase()).toContain('restyle run');
    expect(body).toContain('already existed — refreshed styling');
  });

  it('has a map mode that discovers features, drafting every gap by default but only on --review\'s say-so otherwise', () => {
    expect(frontmatter['argument-hint']).toContain('map');
    expect(body).toContain('Map the whole app');
    expect(body).toContain('crawl.mjs');
    // Autonomous (default) mode drafts every discovered gap feature without
    // asking which; --review mode restores the old "ask which" behavior.
    expect(body.toLowerCase()).toContain('draft every gap feature');
    // Whitespace-tolerant: this phrase legitimately wraps across a line in
    // the 80-col-wrapped markdown source.
    expect(body.toLowerCase()).toMatch(/don't draft\s+all of them/);
    expect(body).toContain('--review');
  });

  it('crawls authenticated (every configured profile plus anonymous) and confirms every source-declared route', () => {
    expect(body).toContain('--all-auth');
    expect(body).toContain('--routes-file');
    expect(body.toLowerCase()).toContain('confirmation crawl');
    expect(body).toContain('source-routes.json');
    expect(body).toContain('reachedBy');
    // A profile with no recorded session yet is a non-blocking, per-profile
    // skip during mapping — not one of the run-halting hard stops.
    expect(body.toLowerCase()).toMatch(/not a hard stop/);
  });

  it("map mode requires a human affirmation before interactive (mutating) crawling", () => {
    expect(body).toContain('--interactive');
    expect(body.toLowerCase()).toContain('throwaway');
  });

  it('map mode also prunes existing tours whose feature looks removed, archiving (never deleting) them', () => {
    expect(body).toContain('Prune existing tours');
    expect(body).toContain('prune.mjs');
    expect(body).toContain('archive-tour.mjs');
    expect(body.toLowerCase()).toContain('code-removed');
    expect(body.toLowerCase()).toContain('route-unreachable');
    expect(body.toLowerCase()).toContain('never delete');
  });

  it('only auto-archives the strong (code-removed) signal — a route the crawl missed is reported, not archived, even autonomously', () => {
    // Regression guard: route-unreachable is checked against a crawl that's
    // explicitly best-effort (bounded maxPages/maxDepth, profiles can be
    // skipped) — treating it as equal to code-removed would risk archiving
    // a live tour on an incomplete/stale site-map.json alone.
    expect(body.toLowerCase()).toContain('safe to auto-archive');
    expect(body.toLowerCase()).toContain('best-effort');
    expect(body.toLowerCase()).toContain('never auto-archived');
  });

  it('has a standalone prune mode for the archival check without a full map run', () => {
    expect(frontmatter['argument-hint']).toContain('prune');
    expect(body).toContain('## Prune orphaned tours');
    expect(body).toContain('node "${CLAUDE_PLUGIN_DATA}/scripts/prune.mjs"');
    expect(body).toContain('--review');
  });

  it('has a product mode that dispatches product-scribe and assembles via generate-product-docs.mjs', () => {
    expect(frontmatter['argument-hint']).toContain('product');
    expect(body).toContain('## Document the product itself');
    expect(body).toContain('product-scribe');
    expect(body).toContain('node "${CLAUDE_PLUGIN_DATA}/scripts/generate-product-docs.mjs"');
    expect(body).toContain('_product.json');
  });

  it("product-scribe's grounding failure for one page is not a hard stop, unlike a tour's", () => {
    expect(body.toLowerCase()).toContain('not a hard stop');
    expect(body.toLowerCase()).toMatch(/product-scribe.*couldn't ground/);
  });

  it('folds product-page regeneration into the normal no-slug pipeline, not just its own mode', () => {
    expect(body.toLowerCase()).toContain('no-slug');
  });

  it('the shared Ship step stages docs/archive/** and docs/_sidebar.autodocs.json alongside docs/*.md', () => {
    expect(body).toContain('docs/archive/**');
    expect(body).toContain('docs/_sidebar.autodocs.json');
  });

  it('init-site wires the sidebar to docs/_sidebar.autodocs.json when it exists, and fixes the homepage link to /docs/overview', () => {
    expect(body).toContain('sidebars.js');
    expect(body).toContain('/docs/overview');
  });
});

describe('scripts/crawl.mjs', () => {
  const source = fs.readFileSync(path.join(pluginRoot, 'scripts/crawl.mjs'), 'utf8');

  it('is bundled alongside capture.mjs', () => {
    expect(fs.existsSync(path.join(pluginRoot, 'scripts/crawl.mjs'))).toBe(true);
  });

  it('supports --all-auth (every configured profile + anonymous) and --routes-file (confirmation crawl)', () => {
    expect(source).toContain("'--all-auth'");
    expect(source).toContain("'--routes-file'");
    // A profile whose session can't be established is skipped, not fatal —
    // the loop over passes must keep going rather than aborting the run.
    expect(source).toMatch(/skip(ped|ping)/i);
  });
});

describe('agents/doc-scribe.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'agents/doc-scribe.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "doc-scribe" with a description and a model set', () => {
    expect(frontmatter.name).toBe('doc-scribe');
    expect(frontmatter.description?.length).toBeGreaterThan(0);
    expect(frontmatter.model).toBeTruthy();
  });

  it('has a bounded maxTurns', () => {
    expect(typeof frontmatter.maxTurns).toBe('number');
    expect(frontmatter.maxTurns).toBeGreaterThan(0);
    expect(frontmatter.maxTurns).toBeLessThanOrEqual(30);
  });

  it('is restricted to exactly Read and Write — no Bash, Edit, or web access', () => {
    const tools = parseToolList(frontmatter.tools);
    expect(tools.sort()).toEqual(['Read', 'Write']);
  });

  it('does not declare mcpServers, hooks, or permissionMode (unsupported for plugin agents)', () => {
    expect(frontmatter.mcpServers).toBeUndefined();
    expect(frontmatter.hooks).toBeUndefined();
    expect(frontmatter.permissionMode).toBeUndefined();
  });

  it("instructs grounding strictly in the a11y snapshot and never inventing UI", () => {
    expect(body.toLowerCase()).toContain('never describe');
    expect(body).toContain('a11y');
  });
});

describe('agents/product-scribe.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'agents/product-scribe.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "product-scribe" with a description and a model set', () => {
    expect(frontmatter.name).toBe('product-scribe');
    expect(frontmatter.description?.length).toBeGreaterThan(0);
    expect(frontmatter.model).toBeTruthy();
  });

  it('has a bounded maxTurns', () => {
    expect(typeof frontmatter.maxTurns).toBe('number');
    expect(frontmatter.maxTurns).toBeGreaterThan(0);
    expect(frontmatter.maxTurns).toBeLessThanOrEqual(30);
  });

  it('is restricted to exactly Read and Write — no Bash, Edit, or web access', () => {
    const tools = parseToolList(frontmatter.tools);
    expect(tools.sort()).toEqual(['Read', 'Write']);
  });

  it('does not declare mcpServers, hooks, or permissionMode (unsupported for plugin agents)', () => {
    expect(frontmatter.mcpServers).toBeUndefined();
    expect(frontmatter.hooks).toBeUndefined();
    expect(frontmatter.permissionMode).toBeUndefined();
  });

  it('instructs grounding strictly in the given files/tour inventory and never inventing content', () => {
    expect(body.toLowerCase()).toContain('ground every claim');
    expect(body.toLowerCase()).toContain('never read anything outside the given file list');
  });

  it('never reads .env, key files, or anything under .auth/, even if it looks relevant', () => {
    expect(body).toContain('.env');
    expect(body).toContain('.auth/');
  });

  it('never copies a secret-looking value into a page', () => {
    expect(body.toLowerCase()).toContain('secret');
  });

  it('omits a page rather than inventing content when it has no real grounding', () => {
    expect(body.toLowerCase()).toContain('omit');
  });

  it('writes exactly one output file, .autodocs/artifacts/prose/_product.json', () => {
    expect(body).toContain('.autodocs/artifacts/prose/_product.json');
  });

  it('is brand-neutral — no tagline or marketing voice, even if the README has one', () => {
    expect(body.toLowerCase()).toContain('brand-neutral');
    expect(body.toLowerCase()).toContain('tagline');
  });
});

describe('agents/tour-scout.md', () => {
  const markdown = fs.readFileSync(path.join(pluginRoot, 'agents/tour-scout.md'), 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);

  it('is named "tour-scout" with a description and a model set', () => {
    expect(frontmatter.name).toBe('tour-scout');
    expect(frontmatter.description?.length).toBeGreaterThan(0);
    expect(frontmatter.model).toBeTruthy();
  });

  it('has a bounded maxTurns', () => {
    expect(typeof frontmatter.maxTurns).toBe('number');
    expect(frontmatter.maxTurns).toBeGreaterThan(0);
    expect(frontmatter.maxTurns).toBeLessThanOrEqual(30);
  });

  it('has no Bash access — only Read, Write, and Playwright MCP tools', () => {
    const tools = parseToolList(frontmatter.tools);
    expect(tools).not.toContain('Bash');
    expect(tools).toContain('Read');
    expect(tools).toContain('Write');
    // Tools from a plugin-bundled MCP server are namespaced
    // mcp__plugin_<plugin-name>_<server-key>__<tool-name> at runtime — a
    // bare `mcp__playwright__*` (the un-namespaced form used for a
    // user/project-level .mcp.json entry) silently resolves to nothing for
    // a plugin-bundled server, verified live: tour-scout reported having
    // only Read/Write with that pattern. See
    // https://code.claude.com/docs/en/mcp.md#plugin-mcp-tool-names.
    expect(tools).toContain('mcp__plugin_autodocs_playwright__*');
  });

  it('does not declare mcpServers, hooks, or permissionMode (unsupported for plugin agents)', () => {
    expect(frontmatter.mcpServers).toBeUndefined();
    expect(frontmatter.hooks).toBeUndefined();
    expect(frontmatter.permissionMode).toBeUndefined();
  });

  it('never sets status: confirmed itself — that is a human decision', () => {
    expect(body).toContain('never set `status: confirmed`');
  });

  it('instructs grounding every step in what it actually observed, never guessing selectors', () => {
    expect(body.toLowerCase()).toContain('ground every step');
    expect(body.toLowerCase()).toContain('rather than guessing');
  });

  it('never auto-fills SSN/payment/government-ID-looking fields, even with synthetic data', () => {
    expect(body).toContain('SSN');
    expect(body.toLowerCase()).toContain('cvv');
  });

  it('requires reporting any synthetic form value or fixture it introduced', () => {
    expect(body.toLowerCase()).toContain('synthetic placeholder data');
  });

  it('accepts an optional site-map affordance hint from /document map, but treats it as a hint only', () => {
    expect(body).toContain('site-map.json');
    expect(body.toLowerCase()).toContain('never substitutes for actually navigating');
  });

  it('shares its synthetic-value/sensitive-field conventions with synthetic-data.mjs', () => {
    expect(body).toContain('synthetic-data.mjs');
  });
});
