# AutoDocs

AutoDocs writes and maintains your app's tutorials for you, by actually
using it. Instead of a human clicking through the app, taking screenshots,
and writing "here's how the dashboard works" — which goes stale the moment
the UI changes — AutoDocs drives a real headless browser against your
*running* app, takes the screenshots itself, and writes grounded,
tutorial-style docs from what it actually saw. It's built for **solo
developers**: one person runs it themselves when a feature's worth
documenting, not a team pipeline that fires on every merge.

It ships as a **Claude Code plugin** — that's the primary way to use it, and
what the rest of this README leads with. New to Claude Code? It's
Anthropic's command-line coding agent — see
[the docs](https://docs.claude.com/en/docs/claude-code) if you want the full
picture, but you don't need to have used it before to follow along; the next
section walks through installing it.

## Prerequisites

- **Claude Code** — install/log in per [its docs](https://docs.claude.com/en/docs/claude-code)
  if you haven't already. Would rather skip it entirely? The underlying
  pipeline is plain Node scripts you can run from a terminal instead — see
  "Running it without Claude Code" below.
- **Node.js 22+** and npm (built and tested against Node 22.21.1; nothing
  here relies on anything newer). Once the plugin is installed, it installs
  its *own* runtime dependencies (Playwright, js-yaml, etc.) into its own
  data directory on first use — never into your project's `node_modules`.
- **git**.

## Install the plugin

This repo doubles as a private Claude Code plugin marketplace with one
plugin in it (`autodocs`). You don't need to clone it into the project you
want to document — just point Claude Code at it once, from anywhere.

Inside Claude Code:

```
/plugin marketplace add esandeepchoudary/autodocs
```

(GitHub shorthand — works as long as you can reach this repo. Working from a
local clone instead? Use the path: `/plugin marketplace add /path/to/autodocs`.)

Then install the plugin from that marketplace:

```
/plugin install autodocs@autodocs-marketplace
```

Activate it in your current session:

```
/reload-plugins
```

(or just restart Claude Code). The first time a session starts with the
plugin active, a `SessionStart` hook installs the plugin's own runtime
dependencies (Playwright, js-yaml, etc.) and the Playwright browser into a
private data directory — this can take a minute the first time (browser
download), and is instant on every session after.

Verify it took:

```
/plugin list
```

should show `autodocs@autodocs-marketplace` enabled.

## Use it in your project

Open Claude Code in whatever project you want tutorials for and run
`/autodocs:document` — plugin skills are namespaced by the plugin's name, so
this is the full command (plain `/document` may also resolve if it's
unambiguous, but `/autodocs:document` always works). **The first time**, it
notices there's no `autodocs.config.yaml` yet, asks for your app's local base
URL, and scaffolds a starter config plus an empty `tours/` directory — then
tells you there's nothing to generate until a tour exists. From there:

- **`/autodocs:document`** — run the full pipeline over every tour.
- **`/autodocs:document <tour-id>`** — just that one tour.
- **`/autodocs:document propose <slug> "<description>"`** — just implemented
  a feature and think it's worth a tutorial? This drafts a *candidate* tour
  instead: the `tour-scout` subagent drives your app via Playwright MCP and
  writes `tours/<slug>.yaml` grounded in what it actually finds, marked
  `status: proposed` — nothing downstream treats it as real until you review
  the steps/selectors, fill in anything left as a TODO, and flip it to
  `confirmed` yourself. See `tours/dashboard-export.yaml` in *this* repo for
  a worked example, start to finish (this repo also happens to be its own
  best demo project — it's both the plugin source and a working AutoDocs
  project).
- **`/autodocs:document init-site`** — once you've got at least one
  confirmed, generated tour, scaffolds a Docusaurus site in your project
  reading its `docs/` folder directly. Prompt-driven, not a bundled script,
  so it adapts to scaffolding-tool changes instead of breaking — but it
  follows a proven recipe, this repo's own `site/`. See "Publishing a docs
  site" below for details and deployment.

Tours are always hand-authored or human-confirmed — nothing here crawls your
app and invents a tour set on its own. Playwright MCP (bundled in the
plugin) is for `tour-scout`'s interactive authoring only; the automated
pipeline (capture/drift/generate) drives Playwright directly and never goes
through MCP.

### It nudges you when a feature looks worth documenting

A second `SessionStart` hook gives Claude standing instructions for every
session in a project where the plugin is installed. Before
`autodocs.config.yaml` exists, that's just a one-line reminder that
`/autodocs:document` will bootstrap things. Once the project is set up, it's
a bit more: whenever Claude finishes a user-facing feature or flow, it's
instructed to ask you whether it's worth a tutorial — suggesting
`/autodocs:document propose <slug> "<description>"` for something new, or
`/autodocs:document <tour-id>` to resync a flow an existing confirmed tour
already covers. It only ever *suggests*; nothing runs or gets marked
`confirmed` without you saying so. See
`plugin/scripts/lib/session-guidance.mjs` for the exact wording.

## Keeping the plugin updated

New commits to this repo (or a version bump) don't reach an
already-installed copy automatically. Third-party and local marketplaces
(like this one) have auto-update **off** by default — that's a safety
default, not a bug. To pull in a newer version:

```
/plugin marketplace update autodocs-marketplace
/reload-plugins
```

Updates only actually land when `plugin/.claude-plugin/plugin.json`'s
`version` field has been bumped since your install — Claude Code caches by
that version string, so new commits alone don't count. If you'd rather not
update by hand, enable auto-update for this marketplace from `/plugin` →
the **Marketplaces** tab → select `autodocs-marketplace` → **Enable
auto-update**.

## How it works

Four stages, run in order — this is what `/autodocs:document` orchestrates
end to end (the same stages are also runnable directly as `npm run`
scripts; see "Running it without Claude Code" below):

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
   served through the bundled Docusaurus site (see "Publishing a docs site"
   below).

## Configuring tours and auth

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
  status: confirmed     # confirmed = ready to use (see "Use it in your project" above)
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
window so you can log in however the app actually requires. Ask Claude to
run:

```bash
node "${CLAUDE_PLUGIN_DATA}/scripts/save-auth-state.mjs" --profile oauth-user
```

(`${CLAUDE_PLUGIN_DATA}` only resolves inside the plugin's own runtime — let
Claude run this rather than pasting it into your own shell. Running the
pipeline standalone instead? Use `node plugin/scripts/save-auth-state.mjs
--profile oauth-user`.)

Log in, come back to the terminal, press Enter. Every tour whose
`preconditions.auth` points at that profile reuses the saved session
directly — no scripted login is ever attempted for it. Verified this really
skips the scripted path, not just that it doesn't error: ran it against a
profile with none of the username/password fields set at all.

### Reproducible data with seeds

A tour's `preconditions.seed` names a fixture — declared under
`autodocs.config.yaml`'s `seeds` map — so a data-dependent flow captures
against the same data every run instead of whatever happens to be there.
Most apps don't need anything to actually *run*: static/demo data (like this
repo's own `demo-baseline`) just needs a `description` and capture treats it
as a no-op. If your app needs an actual reset/seed step, give the fixture a
`command`:

```yaml
seeds:
  demo-baseline:
    description: "Resets the app's database to a known fixture."
    command: "npm run db:seed -- --fixture=baseline"
```

That command **won't run** until you explicitly opt in with
`allowSeedCommands: true` in the config (or `--allow-seed-commands` on
`capture`) — off by default, on purpose: a seed's command is config, and
config is exactly as reachable by an unreviewed change as tour YAML is, so
running it should never be implied just because it's declared. With the gate
off, a tour naming a seed that has a command still captures fine — it just
skips the command and tells you so.

## Publishing a docs site

The fastest path is **`/autodocs:document init-site`** (see "Use it in your
project" above) — it scaffolds a [Docusaurus](https://docusaurus.io/) site
in your project that reads its `docs/` folder directly, no content
duplication.

This repo's own `site/` is that same scaffold, dogfooded:

```bash
cd site && npm install
npm start           # dev server with live reload
npm run build        # static build into site/build/
```

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

## Running it without Claude Code

The plugin is the primary way to use AutoDocs, but the pipeline underneath
it is just plain Node scripts — nothing about it requires Claude Code. This
repo bundles a tiny demo app (a login page + dashboard) so you can see the
whole loop work without installing the plugin at all.

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
tutorial came out.

Everyday commands, once you've got your own `autodocs.config.yaml` and
`tours/` (see "Configuring tours and auth" above):

| Command | What it does |
|---|---|
| `npm run capture -- --tour <id>` | Screenshot one tour, every configured viewport |
| `npm run drift` | Show which tours changed, without generating anything |
| `npm run generate-docs -- --tour <id>` | Write/update that tour's tutorial page (add `--force` to override an edit-outside-keep-region warning) |
| `npm run review-diffs` | Render a before/after/diff report for any screenshot about to be replaced — open `.autodocs/artifacts/diff-report.html` |
| `npm test` | Run the unit test suite (for anyone changing AutoDocs itself, not required to just use it) |

These are the exact same scripts `/autodocs:document` calls under the hood —
see "Developing on the plugin itself" below.

## CI (optional, off by default)

`.github/workflows/docs.yml` can run the whole pipeline in GitHub Actions
and open a PR with anything that changed, but it's parked on manual trigger
(`workflow_dispatch`) rather than firing automatically — this is a
solo-developer tool, so running things yourself is the default, not
something to set up before you can use AutoDocs. If you ever want it
automatic (e.g. on every merge to `main`), the job is ready; you'd flip its
`on:` trigger and set an `ANTHROPIC_API_KEY` repo secret.

## Troubleshooting

- **`/plugin` isn't recognized** — your Claude Code install is out of date;
  check with `claude --version` and upgrade however you installed it, then
  restart.
- **Plugin's installed but `/autodocs:document` doesn't show up** — run
  `/reload-plugins`. Still missing? Clear the cache
  (`rm -rf ~/.claude/plugins/cache`), restart, and reinstall.
- **`capture` hangs or times out** — is the app it's supposed to screenshot
  actually running? (In the "Running it without Claude Code" example,
  that's `npm run dev` inside `demo-app/`, left running in its own
  terminal.)
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
plugin/                    The self-contained, installable Claude Code plugin — see above
  .claude-plugin/plugin.json   Plugin manifest (name, version — bump it to ship updates)
  package.json                 Runtime deps (playwright, js-yaml, ...), installed into
                                CLAUDE_PLUGIN_DATA on first use, never into a target project
  hooks/hooks.json              SessionStart: installs deps + Playwright's browser once,
                                and emits the "suggest documentation" standing guidance
  .mcp.json                    Playwright MCP — bundled, travels with the plugin to any project
  skills/document/SKILL.md      /autodocs:document — bootstraps config/tours, runs the pipeline
  agents/doc-scribe.md          Writes grounded prose for one dirty tour (Read+Write only)
  agents/tour-scout.md          Drafts a candidate tour via Playwright MCP (propose subcommand)
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

## Developing on the plugin itself

```bash
claude plugin validate ./plugin --strict   # structural check
```

Root `package.json`'s `npm run capture`/`drift`/`generate-docs` scripts
(used throughout "Running it without Claude Code" above) call the exact
same code under `plugin/scripts/` — they're how this repo dogfoods its own
plugin against the bundled demo app, without needing a real install.
