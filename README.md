# AutoDocs

AutoDocs writes and maintains your app's tutorials for you, by actually
using it. Instead of a human clicking through the app, taking screenshots,
and writing "here's how the dashboard works" — which goes stale the moment
the UI changes — AutoDocs drives a real headless browser against your
*running* app, takes the screenshots itself, and writes grounded,
tutorial-style docs from what it actually saw. It's built for **solo
developers**: one person runs it themselves when a feature's worth
documenting, not a team pipeline that fires on every merge.

It ships as a **Claude Code plugin**. New to Claude Code? It's Anthropic's
command-line coding agent — see
[the docs](https://docs.claude.com/en/docs/claude-code) if you want the full
picture, but you don't need to have used it before to follow this README.

## Prerequisites

- **Node.js 22+** and npm (this project is built and tested against
  Node 22.21.1; nothing here relies on anything newer).
- **git**.
- **Claude Code**, *only* if you want the `/document` plugin workflow
  described later. The underlying pipeline (`npm run capture`,
  `generate-docs`, etc.) is plain Node scripts — you can run the whole thing
  from a terminal without Claude Code at all.

## Quickstart

This repo bundles a tiny demo app (a login page + dashboard) purely so you
can see the whole loop work before touching your own project.

**Terminal 1** — install everything, then start the demo app and leave it running:

```bash
npm install
cp .env.example .env
cd demo-app && npm install
npm run dev              # http://localhost:5173 — leave this running
```

**Terminal 2** — back in the repo root, capture a real screenshot and turn it into a tutorial:

```bash
npm run capture -- --tour login
npm run generate-docs -- --tour login
cat docs/login.md        # <- look at what it wrote
```

That's the whole loop: a real screenshot went in, a grounded Markdown
tutorial came out. Everything past this point is about how that works, how
to point it at your own app, and how to run it from inside Claude Code
instead of the terminal.

## How it works

Four stages, run in order:

1. **Capture** (`npm run capture`) — a **tour** is a YAML file describing one
   feature walk: which pages to visit, what to click, and where to take
   screenshots. AutoDocs reads a tour and actually drives a headless browser
   through it against your running app — no fixtures, no mocked-up
   walkthrough, the real thing. Every screenshot is taken at every viewport
   size you've configured (desktop + mobile by default), and every
   screenshot comes with an accessibility snapshot of the page at that
   moment — a structured description of what's really on screen, which
   becomes the "ground truth" for step 3.
2. **Drift check** (`npm run drift`) — comparing this capture against the
   last one, has anything actually changed? If a tour's screenshots and
   underlying source code are both unchanged, there's nothing to
   regenerate — skip it. This is what keeps the pipeline cheap: the
   expensive step (3) only runs for tours that actually changed.
3. **Generate** (`npm run generate-docs`) — for anything the drift check
   flagged, write the tutorial prose. This step is **grounded**: it
   describes only what's actually in the accessibility snapshot from step 1,
   never anything invented or guessed, however plausible-sounding. Any text
   you hand-write inside a page's `<!-- autodocs:keep --> ... <!-- /autodocs:keep -->`
   block (a **keep-region**) is preserved untouched across every future
   regeneration — it's yours, not the tool's.
4. **Publish** — the generated Markdown lives in `docs/`, viewable as-is or
   served through the bundled Docusaurus site (see below).

## Using it on your own project

Two things to set up, both by example in this repo:

- **`autodocs.config.yaml`** — your app's `baseUrl`, the `viewports` to
  capture at, and (if pages need to be signed in) an `auth` profile. See the
  comments in this repo's own `autodocs.config.yaml` for every field.
- **`tours/*.yaml`** — one file per feature walk. `tours/login.yaml` is the
  simplest real example in this repo:

  ```yaml
  id: login
  title: "Login page"
  intent: "Show what a signed-out user sees before authenticating."
  maturity: stable      # draft = still churning, skipped until you flip it
  status: confirmed     # confirmed = ready to use (see "Using the Claude Code plugin" below)
  steps:
    - action: goto
      path: /login
    - capture: login-full
      description: "Login form, signed out"
  code_paths:            # source that, if it changes, means this tour is dirty
    - demo-app/src/pages/Login.jsx
    - demo-app/src/pages/Login.css
  ```

  `tours/dashboard.yaml` shows a fuller example: signing in, clicking things,
  and masking volatile content (timestamps, avatars) so it doesn't cause
  false "changed" results. Prefer role-based selectors
  (`role=button[name='...']`) over CSS — they're far less flaky.

### If your app doesn't use a plain username/password login

The `auth` profile shape shown in `autodocs.config.yaml` — fill a username
field, fill a password field, click submit — only covers that one flow. For
OAuth, SSO, a magic link, 2FA, or anything else too varied to script
reliably, give the profile a `storageStatePath` instead:

```yaml
auth:
  oauth-user:
    storageStatePath: .autodocs/artifacts/.auth/oauth-user.manual.json
```

Then record a session for it once — this opens a real, visible browser
window so you can log in however the app actually requires:

```bash
node "${CLAUDE_PLUGIN_DATA}/scripts/save-auth-state.mjs" --profile oauth-user
```

Log in, come back to the terminal, press Enter. Every tour whose
`preconditions.auth` points at that profile reuses the saved session
directly — no scripted login is ever attempted for it. Verified this really
skips the scripted path, not just that it doesn't error: ran it against a
profile with none of the username/password fields set at all.

## Using the Claude Code plugin

Two Claude Code concepts, in one sentence each, if you haven't met them
before: a **skill** is a `/command` that packages up a multi-step procedure;
a **subagent** is a separate Claude instance a skill can hand off a
sub-task to, so that sub-task's back-and-forth doesn't clutter your main
conversation.

`plugin/` packages AutoDocs as exactly that: a `/document` skill that runs
capture → drift check → hands each changed tour to the `doc-scribe`
subagent (which writes the grounded prose, in its own isolated context) →
assembles the final page. It's **self-contained** — the pipeline scripts,
their dependencies, and the Playwright MCP config all live inside `plugin/`,
so it works in *any* project, not just this one.

### Install it once, privately

This repo is itself a private plugin marketplace with one plugin in it.
From anywhere:

```bash
claude plugin marketplace add /path/to/this/repo   # or its git URL
claude plugin install autodocs@autodocs-marketplace
```

The first time Claude Code starts a session afterward, a `SessionStart` hook
installs the plugin's own dependencies (Playwright, js-yaml, etc.) and the
Playwright browser into a private data directory — this can take a minute
the very first time (browser download), and is instant on every session
after. Nothing is installed into your projects' own `node_modules` or
`package.json`.

### Use it in any project

Open Claude Code in whatever project you want tutorials for and run
`/document`. **The first time**, it notices there's no `autodocs.config.yaml`
yet, asks for your app's local base URL, and scaffolds a starter config plus
an empty `tours/` directory — then tells you there's nothing to generate
until a tour exists. From there:

- **`/document`** — run the full pipeline over every tour.
- **`/document <tour-id>`** — just that one tour.
- **`/document propose <slug> "<description>"`** — just implemented a
  feature and think it's worth a tutorial? This drafts a *candidate* tour
  instead: the `tour-scout` subagent drives your app via Playwright MCP and
  writes `tours/<slug>.yaml` grounded in what it actually finds, marked
  `status: proposed` — nothing downstream treats it as real until you review
  the steps/selectors, fill in anything left as a TODO, and flip it to
  `confirmed` yourself. See `tours/dashboard-export.yaml` in *this* repo for
  a worked example, start to finish (this repo also happens to be its own
  best demo project — it's both the plugin source and a working AutoDocs
  project).
- **`/document init-site`** — once you've got at least one confirmed,
  generated tour, scaffolds a Docusaurus site in your project reading its
  `docs/` folder directly. Prompt-driven, not a bundled script, so it
  adapts to scaffolding-tool changes instead of breaking — but it follows a
  proven recipe, this repo's own `site/`. See "Deploying your docs" below
  for publishing it.

Tours are always hand-authored or human-confirmed — nothing here crawls
your app and invents a tour set on its own. Playwright MCP (bundled in the
plugin) is for `tour-scout`'s interactive authoring only; the automated
pipeline (capture/drift/generate) drives Playwright directly and never goes
through MCP.

### It nudges you when a feature looks worth documenting

A second `SessionStart` hook gives Claude standing instructions for every
session in a project where the plugin is installed. Before `autodocs.config.yaml`
exists, that's just a one-line reminder that `/document` will bootstrap
things. Once the project is set up, it's a bit more: whenever Claude finishes
a user-facing feature or flow, it's instructed to ask you whether it's worth
a tutorial — suggesting `/document propose <slug> "<description>"` for
something new, or `/document <tour-id>` to resync a flow an existing
confirmed tour already covers. It only ever *suggests*; nothing runs or gets
marked `confirmed` without you saying so. See
`plugin/scripts/lib/session-guidance.mjs` for the exact wording.

### Developing on the plugin itself

```bash
claude plugin validate ./plugin --strict   # structural check
```

Root `package.json`'s `npm run capture`/`drift`/`generate-docs` scripts
(used throughout this README's Quickstart) call the exact same code under
`plugin/scripts/` — they're how this repo dogfoods its own plugin against
the bundled demo app, without needing a real install.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run capture -- --tour <id>` | Screenshot one tour, every configured viewport |
| `npm run drift` | Show which tours changed, without generating anything |
| `npm run generate-docs -- --tour <id>` | Write/update that tour's tutorial page (add `--force` to override an edit-outside-keep-region warning) |
| `npm run review-diffs` | Render a before/after/diff report for any screenshot about to be replaced — open `.autodocs/artifacts/diff-report.html` |
| `npm test` | Run the unit test suite (for anyone changing AutoDocs itself, not required to just use it) |

## Docs site

`site/` is a [Docusaurus](https://docusaurus.io/) site configured to read
this repo's `docs/` folder directly — no copying, one source of truth.

```bash
cd site && npm install
npm start           # dev server with live reload
npm run build        # static build into site/build/
```

On your own project, `/document init-site` scaffolds an equivalent `site/`
for you — see "Using the Claude Code plugin" above.

## Deploying your docs

`npm run build` only produces static files in `site/build/` — it doesn't
publish them anywhere. Three common targets:

**GitHub Pages** (free, scriptable, no dashboard needed). In
`site/docusaurus.config.js`, set `url` to your Pages URL, `baseUrl` to `/`
(or `/<repo-name>/` for a project page), and `organizationName`/
`projectName` to your GitHub org/repo. Then:

```bash
cd site
GIT_USER=<your-github-username> npm run deploy   # or USE_SSH=true npm run deploy
```

This is Docusaurus's built-in `deploy` command — it builds and pushes
straight to the repo's `gh-pages` branch.

**Netlify / Vercel** (dashboard-driven, no CLI recipe needed): connect the
repo, set the build command to `cd site && npm install && npm run build`
and the publish directory to `site/build`. Both auto-deploy on every push
once connected.

Whichever you use, the docs site itself is a plain static build — nothing
about it is AutoDocs-specific once it's built.

## CI (optional, off by default)

`.github/workflows/docs.yml` can run the whole pipeline in GitHub Actions
and open a PR with anything that changed, but it's parked on manual trigger
(`workflow_dispatch`) rather than firing automatically — this is a
solo-developer tool, so running things yourself is the default, not
something to set up before you can use AutoDocs. If you ever want it
automatic (e.g. on every merge to `main`), the job is ready; you'd flip its
`on:` trigger and set an `ANTHROPIC_API_KEY` repo secret.

## Troubleshooting

- **`capture` hangs or times out** — is the app it's supposed to screenshot
  actually running? (In the quickstart, that's `npm run dev` inside
  `demo-app/`, left running in its own terminal.)
- **Playwright asks for a password / `--with-deps` fails** — some Linux
  setups need root to install system-level browser dependencies. If
  `npx playwright install --with-deps chromium` fails, try
  `npx playwright install chromium` (browser only, no system deps) — that's
  usually enough.
- **Port 5173 already in use** — something else is already running the demo
  app (or a previous run didn't shut down); stop it first, or note whichever
  port Vite actually picked and adjust `baseUrl` in `autodocs.config.yaml`
  for that run.
- **Two runs produce different screenshot hashes for content that "didn't
  change"** — something on the page is genuinely non-deterministic (a
  clock, an animation, live data). Mask it — see `defaultMask` in
  `autodocs.config.yaml` or a tour's own `mask` list.

## Project layout

```
.claude-plugin/marketplace.json  This repo doubles as a private plugin marketplace (one entry: ./plugin)
plugin/                    The self-contained, installable Claude Code plugin — see below
  .claude-plugin/plugin.json   Plugin manifest (name, version — bump it to ship updates)
  package.json                 Runtime deps (playwright, js-yaml, ...), installed into
                                CLAUDE_PLUGIN_DATA on first use, never into a target project
  hooks/hooks.json              SessionStart: installs deps + Playwright's browser once
  .mcp.json                    Playwright MCP — bundled, travels with the plugin to any project
  skills/document/SKILL.md      /document — bootstraps config/tours, runs the pipeline
  agents/doc-scribe.md          Writes grounded prose for one dirty tour (Read+Write only)
  agents/tour-scout.md          Drafts a candidate tour via Playwright MCP (/document propose)
  scripts/                     The engine: capture.mjs, drift.mjs, generate-docs.mjs,
                                review-diffs.mjs, lib/ (unit-tested helpers)
demo-app/                  React + Vite app used to dogfood the plugin (login + dashboard)
tours/*.yaml               This repo's own tours — declarative feature walks
autodocs.config.yaml       This repo's own config: base URL, viewports, auth, masks, threshold
docs/                      This repo's own generated tutorials (images + markdown); edits inside
                           `<!-- autodocs:keep -->` blocks survive regeneration
.autodocs/artifacts/       Capture output + state.json lockfile (gitignored)
site/                      Docusaurus site serving docs/ directly (no content duplication)
.github/workflows/docs.yml Optional CI: parked on manual trigger — see "CI" above
```

Everything under `plugin/` is what gets installed elsewhere; everything else
in this list is this repo's own dogfood project (same relationship as any
app that happens to use its own product).

## Project status

Every phase of the original build plan is done: capture, drift gating,
grounded generation, plugin packaging, publishing, hardening (multi-viewport,
default masks, diff review, edit-safety guard), and assisted tour discovery.
See `autodocs-implementation-brief.md` for the phase-by-phase acceptance
criteria this was built against.

## Learn more

Neither of these is required reading to just use AutoDocs — they're here
for going deeper or contributing:

- **`CLAUDE.md`** — working conventions for anyone (human or Claude)
  developing *on* this repo: testing, git workflow, security review, and the
  tour/doc-generation rules referenced above in full.
- **`autodocs-implementation-brief.md`** — the original design brief: full
  architecture, every phase's acceptance criteria, and the open questions
  each phase resolved.
