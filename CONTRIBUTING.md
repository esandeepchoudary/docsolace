# Contributing to AutoDocs

Project layout, build status, and how to develop on the plugin itself. Part
of [AutoDocs](./README.md).

## Project layout

```
.claude-plugin/marketplace.json  This repo doubles as a private plugin marketplace (one entry: ./plugin)
plugin/                    The self-contained, installable Claude Code plugin — see the main README
  .claude-plugin/plugin.json   Plugin manifest (name, version — bump it to ship updates)
  package.json                 Runtime deps (playwright, js-yaml, ...), installed into
                                CLAUDE_PLUGIN_DATA on first use, never into a target project
  hooks/hooks.json              SessionStart: installs deps + Playwright's browser once,
                                and emits the "suggest documentation" standing guidance
  .mcp.json                    Playwright MCP — bundled, travels with the plugin to any project
  skills/document/SKILL.md      /autodocs:document — bootstraps config/tours, runs the pipeline
  agents/doc-scribe.md          Writes grounded prose for one dirty tour (Read+Write only)
  agents/tour-scout.md          Drafts a candidate tour via Playwright MCP (propose/map subcommands)
  agents/product-scribe.md      Writes grounded product-level prose from README/config/tour inventory
  scripts/                     The engine: capture.mjs, crawl.mjs, drift.mjs, generate-docs.mjs,
                                generate-product-docs.mjs, review-diffs.mjs, validate.mjs,
                                verify-docs.mjs (checks image refs/links before a docs PR),
                                status.mjs (read-only dirty/clean report),
                                design-scan.mjs (design-skill detection),
                                prune.mjs (orphan-tour detection), archive-tour.mjs (archives one),
                                init-project.mjs (bootstrap), save-auth-state.mjs (records a
                                storageStatePath session — the one script meant to be run by
                                hand, in your own terminal, not by Claude),
                                lib/ (unit-tested helpers, incl. design.mjs, docgen.mjs, product.mjs)
demo-app/                  React + Vite app used to dogfood the plugin (login + dashboard)
tours/*.yaml               This repo's own tours — declarative feature walks
autodocs.config.yaml       This repo's own config: base URL, viewports, auth, masks, threshold, docs layout
docs/                      This repo's own generated tutorials (images + markdown); edits inside
                           `<!-- autodocs:keep -->` blocks survive regeneration
docs/overview.md           Generated product overview page + linked tutorial index (see
                           "It also documents the product itself" in the main README)
docs/getting-started.md   Generated install/run/config page
docs/concepts.md           Generated core-vocabulary page
docs/_sidebar.autodocs.json Generated ordering/grouping payload the scaffolded site's sidebar reads
docs/archive/              Tutorials for removed features — see "Archiving a removed feature" in ADVANCED.md
.autodocs/doc-style.json  Distilled design-skill output (page layout knobs) — committed, not gitignored
.autodocs/artifacts/       Capture output + state.json lockfile (gitignored)
site/                      Docusaurus site serving docs/ directly (no content duplication)
llms.txt                   Hand-maintained llms.txt (https://llmstxt.org/) link index for LLMs/agents —
                           copied verbatim to site/static/llms.txt. Not auto-generated (a deliberate
                           choice, unlike everything else in docs/): update both copies when a tour or
                           product page is added/renamed/removed. __tests__/llms-txt-sync.test.mjs
                           fails CI if either copy falls out of sync with the real tour/page inventory.
.github/workflows/docs.yml Optional CI: parked on manual trigger — see "CI" in ADVANCED.md
```

Everything under `plugin/` is what gets installed elsewhere; everything else
in this list is this repo's own dogfood project (same relationship as any
app that happens to use its own product).

## Project status

Every phase of the original build plan is done: capture, drift gating,
grounded generation, plugin packaging, publishing, hardening (multi-viewport,
default masks, diff review, edit-safety guard), assisted tour discovery, and
orphan-tour detection/archiving. See `autodocs-implementation-brief.md` for
the phase-by-phase acceptance criteria this was built against. Since then:
a `verify-docs` preflight before every docs PR (broken image references and
dead internal links, not just a broken build); `/document status`, a
read-only freshness report, plus an opt-in `last_verified` page stamp;
resilient multi-tour capture (`--continue-on-error`, pooled `--all`/repeated
`--tour`, per-tour failure isolation and history); capture-step highlighting,
so a screenshot shows *which* element a step is about; `prerequisites`/
`see_also` cross-links between tour pages; and three more product page
types — configuration, troubleshooting, changelog (the last with a git-tag
fallback when there's no `CHANGELOG.md`).

## Learn more

Neither of these is required reading to just use AutoDocs — they're here
for going deeper or contributing:

- **`CLAUDE.md`** — working conventions for anyone (human or Claude)
  developing *on* this repo: testing, git workflow, security review, and the
  full tour/doc-generation rules referenced throughout [README.md](./README.md),
  [CONFIGURATION.md](./CONFIGURATION.md), and [ADVANCED.md](./ADVANCED.md).
- **`autodocs-implementation-brief.md`** — the original design brief: full
  architecture, every phase's acceptance criteria, and the open questions
  each phase resolved.

## Developing on the plugin itself

```bash
claude plugin validate ./plugin --strict   # structural check
```

Root `package.json`'s `npm run capture`/`drift`/`generate-docs` scripts
(used throughout "Running it without Claude Code" in ADVANCED.md) call the exact
same code under `plugin/scripts/` — they're how this repo dogfoods its own
plugin against the bundled demo app, without needing a real install.

