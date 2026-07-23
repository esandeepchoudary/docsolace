# AutoDocs

Drives a running web app in a headless browser, captures feature screenshots,
and (soon) generates tutorial-style Markdown docs that stay in sync with the
app. See `autodocs-implementation-brief.md` for the full design and phased
build order, and `CLAUDE.md` for project conventions.

## Status

- **Phase 0** — scaffold + deterministic capture proof: done.
- **Phase 1** — tour-driven capture runner (auth, multi-step, masking, a11y
  snapshots, manifest): done.
- **Phase 2** — doc generator (grounded Markdown from captures, surgical
  keep-region updates): done, one tour's worth of prose so far.
- **Phase 3** — drift gate (only dirty tours regenerate) + pixel-diff-gated
  screenshot commits: done.
- **Phase 4** — plugin packaging (`/document` skill, `doc-scribe` subagent,
  project-level Playwright MCP for interactive tour authoring): done.
- **Phase 5** — publish (Docusaurus site serving `docs/` directly) + CI
  (`.github/workflows/docs.yml` opens a docs PR on merge to main): done.
- **Phase 6** — hardening (stretch): multi-viewport capture + config-wide
  default masks done; visual-diff review UI and out-of-keep-region edit
  warnings still open.
- **Phase 7** — assisted tour discovery: scoped in the brief, not built —
  tours stay hand-authored for now.

## Layout

```
demo-app/                  React + Vite app used to exercise the pipeline (login + dashboard)
tours/*.yaml               Declarative feature walks (steps, preconditions, masking)
scripts/capture.mjs        Playwright runner: tour -> screenshots + a11y snapshots + manifest
scripts/generate-docs.mjs  Assembles docs/<tour-id>.md from a tour's captures, gated by drift + pixel-diff
scripts/drift.mjs          Reports which tours are dirty, without changing anything
scripts/lib/               Unit-tested helpers (config/tour loading, hashing, manifest,
                           doc templating, drift/state, pixel-diff)
autodocs.config.yaml       Base URL, viewport, auth profiles, seed fixtures, pixel-diff threshold
docs/                      Generated tutorials (images + markdown); edits inside
                           `<!-- autodocs:keep -->` blocks survive regeneration
.autodocs/artifacts/       Capture output + state.json lockfile (gitignored)
plugin/                    Claude Code plugin: /document skill + doc-scribe subagent
.mcp.json                  Playwright MCP, project-scoped — interactive tour authoring only
                           (capture.mjs drives Playwright directly, not through MCP)
site/                      Docusaurus site serving docs/ directly (no content duplication)
.github/workflows/docs.yml CI: on merge to main, regenerates dirty tours and opens a docs PR
```

## Setup

```bash
npm install
cp .env.example .env   # demo login credentials
cd demo-app && npm install
```

## Run it

```bash
# start the demo app
cd demo-app && npm run dev   # http://localhost:5173

# in another terminal, capture a tour
npm run capture -- --tour login       # public login page
npm run capture -- --tour dashboard   # dashboard (logs in, applies filters)
```

Output lands in `.autodocs/artifacts/`: `screenshots/<tour-id>/`,
`snapshots/<tour-id>/` (accessibility snapshots), and `manifest.json`
(per-capture, per-viewport SHA-256, computed after masking). Every capture
point is shot once per viewport configured in `autodocs.config.yaml`'s
`viewports` map (desktop + mobile by default) — files are named
`<capture>@<viewport-name>.png`.

Then generate the tutorial page from those captures:

```bash
npm run generate-docs -- --tour login
npm run generate-docs -- --tour dashboard
```

Writes `docs/<tour-id>.md` + copies its screenshots into `docs/images/`. Any
text you add inside the `<!-- autodocs:keep -->` block at the bottom of a
page survives the next regeneration.

`generate-docs` only regenerates a tour if it's actually changed (its
screenshots or its `code_paths` source) since the last generation — see
`.autodocs/artifacts/state.json`. A recaptured screenshot only replaces the
one committed under `docs/images/` if enough pixels changed
(`pixelDiffThreshold` in the config); otherwise the existing image is left
alone to avoid binary git churn. To see what's dirty without generating
anything:

```bash
npm run drift
```

## Test

```bash
npm test
```

## Docs site

`site/` is a Docusaurus site configured to read the repo's `docs/` folder
directly (`path: '../docs'` in `docusaurus.config.js`) — no copying, no
second source of truth. It treats docs as plain CommonMark
(`markdown.format: 'md'`), since the `<!-- autodocs:keep -->` comments
`generate-docs.mjs` writes aren't valid MDX (Docusaurus's default parser).

```bash
cd site && npm install
npm start           # dev server with live reload
npm run build       # static build into site/build/
```

## CI

`.github/workflows/docs.yml` runs on every push to `main`: captures all
tours, checks drift, and — only if something's actually dirty — runs the
same procedure as the `/document` skill (Claude Code headlessly dispatching
`doc-scribe` per dirty tour, then `generate-docs.mjs`) and opens a PR with
the result via `peter-evans/create-pull-request`. Requires an
`ANTHROPIC_API_KEY` repo secret. Never auto-merges — review the PR like any
other docs change.

The intended cadence is recorded in `autodocs.config.yaml`'s `runTrigger`
(default `merge-to-main`); GitHub Actions triggers are static YAML, so
changing that value means updating the workflow's `on:` block to match.

## Plugin

`plugin/` packages the pipeline as a Claude Code plugin: a `/document` skill
that runs capture → drift check → dispatches each dirty tour to the
`doc-scribe` subagent (isolated context, grounded strictly in that tour's a11y
snapshot, `Read`+`Write` only) → assembles the page via `generate-docs.mjs`.

To try it in this repo without a full marketplace install:

```bash
claude plugin validate ./plugin --strict   # structural check
claude plugin init autodocs-dev            # scaffolds ~/.claude/skills/autodocs-dev/
# then copy plugin/skills, plugin/agents, and plugin/.claude-plugin into it,
# or symlink them, and restart Claude Code — /document becomes available.
```

Tours are hand-authored, not auto-discovered — see the "Tour and doc-generation
conventions" section in `CLAUDE.md`. `.mcp.json` wires up Playwright MCP at
the project level for *interactively* authoring a new tour with a human at
the keyboard; the automated pipeline drives Playwright directly and never
goes through MCP.
