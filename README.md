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

## Quickstart

Inside Claude Code:

```
/plugin marketplace add esandeepchoudary/autodocs
/plugin install autodocs@autodocs-marketplace
/reload-plugins
```

Then, in the project you want tutorials for:

```
/autodocs:document
```

The first run bootstraps the project — asks for your app's local base URL,
writes a starter `autodocs.config.yaml`, creates an empty `tours/`. Once
you've built something worth documenting:

```
/autodocs:document propose <slug> "<description>"
```

drafts a tour by actually driving your app, then — by default — carries it
all the way through to an opened docs PR. That's the whole loop.

Everything below is reference material for when you need more: every mode
`/autodocs:document` supports, configuring auth, edge cases (uploads, async
content, non-password logins, voice input), mapping a whole app at once, and
publishing a docs site. If `/plugin` doesn't behave as expected, jump to
"Troubleshooting" below.

## Prerequisites

- **Claude Code** — install/log in per [its docs](https://docs.claude.com/en/docs/claude-code)
  if you haven't already. Would rather skip it entirely? The underlying
  pipeline is plain Node scripts you can run from a terminal instead — see
  "Running it without Claude Code" under "Advanced topics" below.
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
URL, and bootstraps the project: a real, annotated `autodocs.config.yaml`
(every optional section — `auth`, `defaultMask`, `seeds`, etc. — included as
commented-out examples right in the file), an empty `tours/` directory with
a short "what's next" `tours/README.md`, a `.env.example`, and — worth
calling out since it's easy to get wrong by hand — your project's
`.gitignore` gets `.autodocs/artifacts/` and `.env` added automatically, so
the session cookies and credentials those can hold never end up committed.
Then it tells you there's nothing to generate until a tour exists. From
there:

| Command | What it does |
|---|---|
| `/autodocs:document` | Run the full pipeline over every tour, ship a docs PR |
| `/autodocs:document <tour-id>` | Same, but just that one tour |
| `/autodocs:document propose <slug> "<description>"` | Draft a new tour for a feature you just built (via the `tour-scout` subagent), then ship it |
| `/autodocs:document map` | Discover every feature automatically (authenticated crawl + code review), draft and ship a tour for every gap, and archive any existing tour whose feature looks removed |
| `/autodocs:document prune` | Just the archival check above, on its own — no crawl required for the common case |
| `/autodocs:document product` | (Re)generate the overview/getting-started/concepts product pages (via the `product-scribe` subagent), then ship |
| `/autodocs:document validate` | Preflight-check config/tours/product pages, no browser — rarely needed by hand, mostly for CI |
| `/autodocs:document status` | Report which tours/product pages are dirty, clean, or gated, and when each was last generated — read-only, no browser |
| `/autodocs:document init-site` | Scaffold a Docusaurus site for `docs/` (re-running it on an existing site re-applies styling instead of refusing) |

Every mode above except `validate` runs autonomously by default: draft or
capture → generate → open a docs PR, without stopping for review at each
step — that PR (never auto-merged) is the review point. A short list of hard
stops still halts a run and asks rather than pushing through: `tour-scout`
couldn't ground the feature, a voice/microphone flow (always reported
`unverified`), a `validate` error, an auth session that needs a real human at
a headed browser, or a hand-edited docs page outside its keep-region. Append
`--review` to any mode above to fall back to the original stop-and-ask-at-
every-step behavior instead; append `--no-style` to skip design-skill
detection for that run. See `tours/dashboard-export.yaml` in *this* repo for
a worked `propose` example, start to finish (this repo also happens to be
its own best demo project — it's both the plugin source and a working
AutoDocs project), and "Mapping a whole app automatically" under "Advanced
topics" below for how `map` actually works. Playwright MCP (bundled in the
plugin) is for `tour-scout`'s interactive authoring only; the automated
pipeline (capture/drift/generate/crawl) drives Playwright directly and never
goes through MCP.

### It ships a docs PR for you

Once a run has something to commit, it opens (or updates) a PR itself: it
runs `review-diffs` first and folds that report into the commit/PR body (the
only place a screenshot change is visible before it's pushed), stages just
`docs/` and `tours/*.yaml`, and commits **onto whatever branch you're already
on** if it's a `feat/*` or `fix/*` branch — docs land in the same PR as the
feature they document. From `main`/`master` it creates a fresh `docs/<slug>`
branch instead; it never commits generated docs straight to `main`. It never
merges anything — opening or updating the PR is the end of its job.

### It nudges you when a feature looks worth documenting

A second `SessionStart` hook gives Claude standing instructions for every
session in a project where the plugin is installed. Before
`autodocs.config.yaml` exists, that's just a one-line reminder that
`/autodocs:document` will bootstrap things. Once the project is set up, it's
a bit more: whenever Claude finishes a user-facing feature or flow, it's
instructed to ask you whether it's worth a tutorial — suggesting
`/autodocs:document propose <slug> "<description>"` for something new, or
`/autodocs:document <tour-id>` to resync a flow an existing confirmed tour
already covers. Running the suggested command is still your call — but once
you run it, it no longer stops to wait on you at every step: it carries the
draft through to an opened PR by default (see "It ships a docs PR for you"
above), unless it hits one of that section's hard stops. See
`plugin/scripts/lib/session-guidance.mjs` for the exact wording.

### It also documents the product itself

Tours describe individual UI flows; a separate, smaller set of pages
describes the product as a whole so a fresh reader lands somewhere that
actually explains what they're looking at instead of an alphabetical list of
tutorials. `/autodocs:document product` (re)generates up to three pages —
`docs/overview.md`, `docs/getting-started.md`, `docs/concepts.md` — via the
`product-scribe` subagent, grounded strictly in files already in your repo:
`README.md`, `package.json`, `.env.example`, `autodocs.config.yaml`, any
extra globs you list under `product.sources`, and the confirmed tour
inventory (id/title/intent) — never the running app, and never `.env`,
key/credential files, or anything under a `.auth/` directory, even if a glob
would otherwise match them. If a page has nothing real to ground it in (e.g.
no `README.md` at all), it's skipped and reported rather than padded with
invented content.

This isn't a separate chore — the normal no-argument `/autodocs:document` run
keeps these pages in sync automatically too, the same drift-gated way it
already does for tours (see "How it works" below), so `/document product` is
mainly for regenerating them on their own without touching any tour. See
"Configuring tours and auth" below for `product.pages`/`product.sources`, and
`docs.sections` for grouping tours in the generated sidebar.

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
scripts; see "Running it without Claude Code" under "Advanced topics"
below):

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

Alongside tours, the same capture → drift → generate shape maintains the
product-level overview/getting-started/concepts pages (see "It also
documents the product itself" above) — except step 1 (capture) doesn't apply
to them at all: there's no browser involved, their "ground truth" is the
repo's own README/package.json/config/tour inventory instead of an
accessibility snapshot.

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
  status: confirmed     # confirmed = ready to use; proposed = drafted, not yet reviewed;
                         # archived = feature looks removed — see "Archiving a removed feature" below
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

  Every step's `action`, in one place:

  | action | fields | what it does |
  |---|---|---|
  | `goto` | `path` | Navigate to a site-relative path |
  | `click` | `selector` | Click an element |
  | `fill` | `selector`, `value` | Set a form input/textarea's value directly |
  | `type` | `selector`, `value` | Simulate real keystrokes — for contenteditable/rich-text editors and autocomplete widgets `fill` doesn't work on |
  | `select` | `selector`, `value` | Choose a `<select>` option |
  | `check` | `selector`, `checked` (optional, default `true`) | Set a checkbox/radio's checked state |
  | `press` | `selector`, `key` | Send a keyboard key (e.g. `Enter`, `Escape`) |
  | `hover` | `selector` | Hover to reveal tooltip/menu UI |
  | `upload` | `selector`, `file` | Upload a `fixtures/<name>` file — see "Advanced topics" below |
  | `wait` | `selector`, `state` (`visible`\|`hidden`\|`attached`\|`detached`) | Wait for an element to reach a state before continuing — see "Advanced topics" below |
  | *(none)* | `capture`, `description` | Take a screenshot + accessibility snapshot at this point |

  `fill`/`type`/`select`/`check`/`press`/`hover` don't wait for anything
  after acting, unlike `goto`/`click`/`upload` — add an explicit `wait` step
  when something needs a moment to happen (see "Waiting for async content"
  under "Advanced topics" below).

  A capture step also takes an optional `highlight` field — a role=/text=
  locator (same convention as everywhere else) for the element that step is
  about. Outlined in the screenshot itself, so a reader sees exactly which
  button/field the step describes instead of a plain full-page shot:

  ```yaml
  - capture: export-button
    description: "Export CSV button visible on the dashboard"
    highlight: "role=button[name='Export CSV']"
  ```

  Checked fresh per viewport — an element visible at desktop but hidden
  behind a collapsed menu at mobile just means that viewport's screenshot has
  no highlight (a warning, not a failure). The outline color is a neutral
  default, overridable via `.autodocs/doc-style.json`'s `page.highlightColor`
  if a design skill supplies an accent color. Adding or changing a
  `highlight` changes that step's screenshot pixels like any other visual
  edit — it goes through the normal pixel-diff gate, so check
  `npm run review-diffs` before shipping.

  A tour also takes two optional top-level fields — `prerequisites` and
  `see_also`, both lists of other tour ids — that render as "Before you
  start"/"See also" link lists on the generated page:

  ```yaml
  id: dashboard-export
  prerequisites:
    - login              # rendered above the intent, linking to login.md
  see_also:
    - dashboard-overview  # rendered after the steps, linking to dashboard-overview.md
  ```

  Purely mechanical — the link text is the target tour's own `title`, no
  subagent involved, so there's nothing here that can hallucinate. `npm run
  validate` errors if an id doesn't match a real tour under `tours/`, and
  warns if it matches one that isn't published yet (`maturity: draft` or
  `status: proposed`/`archived`). Renaming, retitling, or archiving *any*
  tour re-renders every page that links to it automatically on the next run
  — no extra step needed.

### Page layout and design-skill styling

Every capture is shot at each viewport in `autodocs.config.yaml`'s
`viewports` map (see above). By default, only the first viewport's
screenshot renders inline in a generated page — every other viewport's
screenshot collapses into a `<details>`/`<summary>` block the reader can
expand, instead of stacking every viewport's full-page screenshot one after
another. `autodocs.config.yaml`'s optional `docs:` section controls which
viewport stays inline:

```yaml
docs:
  primaryViewport: desktop        # must name a key under `viewports`; default = first key
  collapseOtherViewports: true    # false restores the old flat, all-inline layout
  stampVerified: false            # true stamps each page's frontmatter with "last_verified: <date> (<commit>)"
```

`stampVerified` (opt-in, default off) writes the same date/commit
`npm run status`/`/document status` already reads out of `state.json` onto
the page itself, so a reader can see how fresh a tutorial is without leaving
it. It only advances when the page is actually regenerated — never on a run
where nothing changed, so it can't be used to prove "someone checked this
today," only "this is what changed and when." Flipping it re-renders every
existing page once, through the normal drift gate — no extra step needed.

**Design-skill styling.** If your project has a design/brand skill installed
(under `.claude/skills/` or an installed plugin, project- or user-scoped —
e.g. a company brand-guide skill), `/document` auto-detects it before
generating docs and applies it to two places, presentation only — it never
touches what `doc-scribe` writes or which UI a tour describes:

- The scaffolded Docusaurus site's theme (`site/src/css/custom.css`,
  `site/docusaurus.config.js`'s `themeConfig` — colors, fonts, logo,
  favicon).
- A small set of page-layout knobs, distilled into a committed
  `.autodocs/doc-style.json`: the "Steps" heading text, per-viewport summary
  labels for the collapsed blocks above (e.g. "On your phone" instead of
  "Mobile view"), and whether each screenshot is wrapped in a
  `<figure class="autodocs-figure">` for the theme to style further.

No design skill installed (the common case) means nothing changes — plain,
unbranded docs, same as before this feature existed. Append `--no-style` to
any `/document` invocation to skip detection for that run regardless; just
re-run `/document init-site` to re-detect and re-apply after installing a
different skill or changing the existing one — it's idempotent, so running
it again on an already-scaffolded site refreshes styling instead of
refusing. A change to the `docs:` block or to `doc-style.json` automatically
re-renders every existing page on the next `/document` run — no `--force`
needed — because it changes each tour's render hash (part of what
`drift.mjs` checks), independent of that tour's own screenshots or code.

### Product pages and sidebar sections

Two more optional `autodocs.config.yaml` sections, both consumed by
`/document product` (and folded into the normal pipeline — see "It also
documents the product itself" above):

```yaml
product:
  name: "My App"                                  # optional; defaults to package.json's name
  pages: [overview, getting-started, concepts]     # default: all three
  sources:                                         # extra grounding files/globs, beyond the
    - "docs-src/**/*.md"                           # standing README/package.json/.env.example/
                                                    # autodocs.config.yaml set
docs:
  sections:                                        # groups tour pages in the generated sidebar
    - label: "Getting started"                     # (docs/_sidebar.autodocs.json); a tour named
      tours: [login]                               # in no section just sorts into one flat
    - label: "Dashboard"                            # "everything else" group instead
      tours: [dashboard-overview, dashboard-export]
```

Every tour page always gets a `sidebar_position` (the product pages pin
above them at 1–3) so the sidebar sorts deterministically even without
`docs.sections` — grouping into named categories is the opt-in part, not the
ordering. `product.sources` entries must be project-relative globs (no
absolute paths, no `..` segments) — `/document validate` warns if one
matches nothing, or if `docs.sections` names a tour that doesn't exist.
`product-scribe` never reads `.env`, key/credential files, or anything under
a `.auth/` directory, no matter what a glob would otherwise match.

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

**Search is built in.** `init-site` wires up
[`@easyops-cn/docusaurus-search-local`](https://github.com/easyops-cn/docusaurus-search-local)
— self-contained, indexed at build time into `site/build/search-index.json`,
no external account or API key needed (deliberately not Algolia DocSearch,
which requires both). It picks up every generated tutorial automatically,
including anything under `docs/archive/` (see "Archiving a removed feature"
above) — nothing to configure per tour. Search results are only as fresh as
your last build/deploy, same as every other page on the site. Running
`/autodocs:document init-site` again on an existing site (a "restyle run")
backfills search onto a site scaffolded before this feature existed,
independent of `--no-style` — it's a capability, not a styling choice.

**Sidebar is generated, not autogenerated-alphabetical.** Once at least one
product page exists, `generate-product-docs.mjs` writes
`docs/_sidebar.autodocs.json` — a plain, framework-neutral ordering/grouping
payload — and `init-site` wires `site/sidebars.js` to build the site's real
sidebar from it (product pages first, then `docs.sections` groups, then
everything else) instead of Docusaurus's default alphabetical-by-filename
sidebar. Same backfill shape as search: re-running `init-site` on an
existing site picks this up automatically once the file exists.

## Troubleshooting

- **`/plugin` isn't recognized** — your Claude Code install is out of date;
  check with `claude --version` and upgrade however you installed it, then
  restart.
- **Plugin's installed but `/autodocs:document` doesn't show up** — run
  `/reload-plugins`. Still missing? Clear the cache
  (`rm -rf ~/.claude/plugins/cache`), restart, and reinstall.
- **`capture` hangs or times out** — is the app it's supposed to screenshot
  actually running? (In the "Running it without Claude Code" example under
  "Advanced topics" below, that's `npm run dev` inside `demo-app/`, left
  running in its own terminal.)
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

## Advanced topics

Not needed for the common path above — reach for these when you hit the
specific case: uploading a file, filling out forms, waiting on async
content, CAPTCHA, a non-password login, a third-party integration, seed
data, voice input, mapping a whole app at once, running the pipeline without
Claude Code at all, or wiring up CI.

### Uploading a file

If a flow requires uploading a file — a CSV importer, an image, a sample
data file — before anything interesting shows up, use an `upload` step:

```yaml
steps:
  - action: goto
    path: /analyze
  - capture: upload-form
    description: "Empty upload form"
  - action: upload
    selector: "input[type='file']"
    file: fixtures/sample.csv
  - capture: analysis-result
    description: "Result view after uploading a sample file"
```

`file` must point at a project-committed file under `fixtures/<name>` (not
a secret — a small, deterministic sample the app can process the same way
every run); anything outside `fixtures/` is rejected. Unlike every other
selector in a tour, target the real `<input type="file">` element with a
CSS selector rather than a role locator — file inputs have no meaningful
accessible role for this, so CSS is the documented exception here.

Drafting via `/document propose`? If you didn't hand-author a fixture,
`tour-scout` will try to self-author a small one for simple, inferable
formats (CSV/JSON only when a shape is actually visible on the page,
plain text, or an image via a real screenshot) and verify the upload
actually succeeds before finalizing the step. For anything else — a
domain-specific or unknown binary format — it still stops and asks for a
real fixture, same as before. Either way, it's flagged in tour-scout's
report so you know to review it.

### Filling out forms and editing content

Use `fill` for standard inputs/textareas — it sets the value directly, fast
and deterministic:

```yaml
steps:
  - action: fill
    selector: "role=textbox[name='Full name']"
    value: "Ada Lovelace"
  - action: select
    selector: "role=combobox[name='Country']"
    value: "uk"
  - action: check
    selector: "role=checkbox[name='Subscribe to updates']"
    checked: true
  - action: click
    selector: "role=button[name='Save']"
```

Use `type` instead of `fill` only when `fill` genuinely doesn't work —
contenteditable rich-text editors, or a JS-driven autocomplete/
search-as-you-type widget that listens for real keystroke events rather than
a value change:

```yaml
- action: type
  selector: "[contenteditable='true']"
  value: "Meeting notes go here."
```

Never put a real credential in a `fill`/`type` step's `value` — for a login
form, use the `auth` mechanism above instead; a tour's YAML is committed to
your repo, and a hardcoded password in it is a leaked password.

Drafting via `/document propose`? A form field starts empty, so when you
didn't give it a real value, `tour-scout` fills in an obviously-fake
placeholder inferred from the field's label — `user@example.com` for an
email field, a `555-01XX` number for phone, a generic non-notable name,
and so on (all flagged in its report). It will never auto-fill anything
that looks like an SSN, government ID, or payment card field, synthetic or
not — that's left for you to fill in yourself, same as a password field.

### Waiting for async content (e.g. an AI chat reply)

`fill`/`type`/`select`/`check`/`press`/`hover` don't wait for anything after
acting, so a `capture` placed right after one of them might run before an
async response has appeared. Add a `wait` step targeting a stable signal —
here, a chat UI whose "typing…" indicator disappears once the reply is
ready:

```yaml
steps:
  - action: fill
    selector: "role=textbox[name='Message']"
    value: "What's the weather like?"
  - action: press
    selector: "role=textbox[name='Message']"
    key: "Enter"
  - action: wait
    selector: "role=status[name='Typing indicator']"
    state: hidden
  - capture: chat-response
    description: "Assistant's reply to a weather question"
    mask:
      - "[data-testid='chat-message']"
```

Mask the response's actual text (`mask` above) — an AI-generated reply is
non-deterministic even once it's finished, so the tour can prove *that* a
response appeared without depending on its exact wording changing the
drift/pixel-diff result every run.

### CAPTCHA

AutoDocs doesn't attempt to solve, guess past, or script around a CAPTCHA —
that's a different kind of feature than "drive an app that trusts you," and
not one this project builds. If a flow you want documented is
CAPTCHA-gated, the realistic path is the same one this project already uses
for anything else too varied to script reliably (see OAuth/SSO below):
capture against a dev/staging environment where the app itself disables
CAPTCHA for testing, rather than trying to defeat it.

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
window, so it needs to run **in your own terminal**, not handed to Claude to
run: Claude's Bash tool has no display to show that browser window in, and
often no interactive stdin either — which matters for the next part. Ask
Claude what `${CLAUDE_PLUGIN_DATA}` resolves to for this session (it can
tell you without running the command itself), then run it yourself:

```bash
node "<the resolved path>/scripts/save-auth-state.mjs" --profile oauth-user
```

(Running the pipeline standalone instead? Use `node
plugin/scripts/save-auth-state.mjs --profile oauth-user`.)

By default it waits for you to log in and press Enter once you're done —
fine from your own terminal, since it's a real TTY. If you'd rather it
detect completion on its own (or you're running it somewhere without a
reliable stdin), pass `--wait-for "<url-pattern>"` — e.g. `--wait-for
"**/dashboard"` — and it saves the session automatically the moment the
browser navigates to a matching URL, no Enter needed. Without a real
terminal *and* without `--wait-for`, it refuses up front with a clear
message instead of hanging forever waiting for input that will never come.

Every tour whose `preconditions.auth` points at that profile reuses the
saved session directly — no scripted login is ever attempted for it.
Verified this really skips the scripted path, not just that it doesn't
error: ran it against a profile with none of the username/password fields
set at all.

### Third-party integrations (Slack, Google, Stripe, etc.)

A "Connect to Slack" button that pops open a real OAuth consent screen on
someone else's domain isn't something AutoDocs scripts through — same call
as CAPTCHA above, and for the same reasons: a third party's login/consent
UI changes without notice, can add MFA at any time, and automating it
starts to look like credential automation against a service you don't
control. `tour-scout` will stop and report if it hits one, rather than
attempting to click through it.

The fix is the same idea as OAuth/SSO login above, just applied to the
*integration's* connected state instead of the app's own session: connect
it once, out of band, in whatever environment you capture against (most
apps happily keep an integration connected indefinitely once it's set up),
then write the tour against the already-connected UI. There's nothing
AutoDocs-specific to configure for this — it's just making sure the
environment your tours run against already has the integration turned on
before you draft or capture anything that assumes it.

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

### Voice input

For an app with a microphone-driven feature (a "press to talk" button, a
voice command bar), a tour's `preconditions.voice` names a fixture audio
file under `fixtures/<name>.wav`, fed to the browser as a fake microphone:

```yaml
preconditions:
  voice: fixtures/sample-command.wav
steps:
  - action: goto
    path: /assistant
  - action: click
    selector: "role=button[name='Start recording']"
  - action: wait
    selector: "role=status[name='Transcript']"
    state: visible
  - capture: voice-result
    description: "Transcript shown after recording a sample voice command"
    mask:
      - "[data-testid='transcript-text']"
```

Unlike `upload`'s `file`, this is a **precondition**, not a per-step action
— it's resolved once, before the browser launches, because Chromium's
fake-microphone flags only take effect at launch time (they can't be
applied mid-page the way a locator action can). Mask the transcript's
actual text in the following capture, same as any AI-generated response —
see "Waiting for async content" above for why: speech-to-text output is
non-deterministic even when it's working correctly.

### Mapping a whole app automatically

`/autodocs:document map` discovers what to document instead of you naming
one feature at a time, via three complementary passes designed to actually
reach *every* feature, not just whatever's linked from the homepage:

1. an **authenticated discovery crawl** — once per configured `auth`
   profile, plus one signed-out pass — so admin-only and user-only features
   are both found, not just what an anonymous visitor can reach;
2. a **code review** of the app's own routing/source, which names every
   feature and its backing files, including ones no crawl pass happened to
   link to;
3. a **confirmation crawl** that directly visits every route the code review
   found, again under every profile, so a feature reachable only via
   in-app JS/button navigation (never a real `<a href>`) still gets probed.

These reconcile into a proposed feature list and doc structure, each entry
tagged with which role(s) actually reached it (or flagged if none did), then
dispatches `tour-scout` for every discovered gap. **By default** it drafts,
validates, confirms, generates, and ships all of them — same autonomous
behavior and hard stops as `propose` (see "It ships a docs PR for you"
above), just covering the whole app per invocation instead of one feature.
Append `--review` to get the previous behavior back: it asks which features
you want drafted before dispatching `tour-scout` for any of them, and stops
after each draft instead of confirming it.

```
node "${CLAUDE_PLUGIN_DATA}/scripts/crawl.mjs" --all-auth
```

By **default the crawl is read-only**: it navigates same-origin links and
records what it finds — page titles, and the buttons/forms/links present —
into `.autodocs/artifacts/site-map.json`, tagging each page with
`reachedBy: [...]` (which profile(s), or `"anonymous"`, reached it). It never
submits a form or clicks an action button in this mode. Bounded by
`crawl.maxPages` / `crawl.maxDepth` in config (defaults: 50 pages, depth 4)
so it can't run away on a large app, and it never follows a logout/sign-out
link (that would kill its own session mid-crawl) or leave the app's origin.

`--all-auth` runs one crawl pass per profile under `autodocs.config.yaml`'s
`auth` map, plus one signed-out pass, and merges them (unioning
`reachedBy`/affordances per route, keeping the shallowest depth any pass
found it at) — pass a single `--auth <profile>` instead for just one role, or
neither for the old signed-out-only default. **A profile whose session
hasn't been recorded yet is skipped, not fatal**: `crawl.mjs` reports exactly
which profile and why (missing credentials, or an unrecorded
`storageStatePath` — with the same `save-auth-state.mjs` hint capture.mjs
gives), and keeps crawling under every other profile so one missing role
never blocks mapping the rest of the app.

`--routes-file <path>` runs the **confirmation crawl**: instead of a
link-following BFS, it directly visits every site-relative route listed in
the given JSON array (one per line, e.g.
`["/", "/dashboard", "/admin/users"]`) — the route list `/document map`
writes to `.autodocs/artifacts/source-routes.json` after reading the app's
source. Combine it with `--max-depth 0` (no following links out from these
routes) and `--all-auth` to probe every source-declared route under every
role in one pass. A route that redirects to a login/error page under a given
profile is recorded landing there — the "gated for this role" signal, not a
crash. Every entry is validated as a site-relative path (`/foo`, never an
absolute or protocol-relative URL) before it's navigated to, the same guard a
tour's own `goto` step gets — this file is `/document map`-generated, not
hand-authored, so it's treated as untrusted input per this project's own
security conventions.

**Interactive mode** (`crawl.mjs --interactive`) additionally fills in and
submits forms with synthetic data, and clicks buttons, to reach states a
pure link-crawl can't reach on its own (e.g. a search results page). This
is **double opt-in, off by default** — it requires *both* the `--interactive`
flag *and* `crawl.allowInteractive: true` in `autodocs.config.yaml`, the
same shape as `allowSeedCommands` above, since a crawler that submits forms
on a real authenticated app can trigger real side effects (an email sent, a
support ticket filed) if pointed at anything but a throwaway/dev
environment. **Even with interactive mode on, it never touches a sensitive
field** (password, SSN, payment/card number, CVV, API key/token — the same
`isSensitiveField` check `tour-scout`'s own form-filling guidance uses) **or
clicks a destructive-sounding control** (delete, pay, send, log out, and
similar — `isDestructiveControl`) — those exclusions aren't something the
config flag can widen.

```yaml
crawl:
  maxPages: 50
  maxDepth: 4
  allowInteractive: false # only set true against a throwaway/dev environment
```

After both crawls, `/document map` reads the app's own routing/source to name
each feature and its backing files, cross-checks that against the merged
`site-map.json`, and writes `.autodocs/artifacts/doc-plan.md` — the
reconciled list (each feature's route, description, `code_paths`, and which
role(s) reached it, or a flag if none did) plus a suggested section
structure, and the audit trail for what gets drafted next (all of it, by
default; whatever you pick, under `--review`).

### Archiving a removed feature

Drift gating keeps docs in sync when a feature *changes*; this is the other
direction — what happens when a feature is *removed*. Without it, a tour for
a deleted page either goes stale silently or starts failing capture with a
confusing error the next time it runs.

`/document map` checks for this automatically (as part of its full
reconciliation), or run just this check on its own:

```
/autodocs:document prune
```

It flags a **confirmed** tour as an orphan candidate on two mechanical
signals — no guessing involved, and not treated as equally trustworthy:

- **`code-removed`** — the tour's `code_paths` used to resolve to real files
  (it was captured/generated successfully before) and no longer does. Checked
  against the committed git tree directly — exact, not a sample.
- **`route-unreachable`** — none of the tour's `goto` steps' paths turn up in
  a crawl or code-review pass (only checked when `/document map` has already
  produced `site-map.json`/`source-routes.json` to check against; `prune` on
  its own, with neither file present yet, checks `code-removed` only). A
  crawl is explicitly best-effort elsewhere in this project too (bounded by
  `maxPages`/`maxDepth`, a profile can be skipped) — an unreached route is a
  reason to look, not proof the feature is gone, so this signal **alone never
  triggers auto-archiving**, even in autonomous mode.

**By default it auto-archives only tours flagged `code-removed`** — same
autonomous-by-default posture as every other mode (see "It ships a docs PR
for you" above), but only where the evidence is exact — by flipping
`status: confirmed` to `status: archived` and moving the generated page (and
images) from `docs/<id>.md` to `docs/archive/<id>.md`, with a banner
explaining why. It's **never deleted**: `tours/<id>.yaml` and every word of
prose survive, just relocated, so a wrong call is a one-line revert — flip
`status` back to `confirmed` and move the page back. A `route-unreachable`-
only candidate is always just reported, for a human to check. Append
`--review` to list every candidate (both signals) and stop instead of
archiving anything.

`docs/archive/` gets its own `_category_.json`, so the scaffolded Docusaurus
site (see "Publishing a docs site" below) files every archived tutorial into
a dedicated **Archive** section at the bottom of the sidebar automatically —
nothing to configure by hand. An archived tour is permanently skipped by
`capture`/`drift`/`generate-docs`/`validate`, the same way `draft`/`proposed`
tours are — its feature is gone, so there's nothing left to capture.

### Running it without Claude Code

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
| `npm run validate` | Preflight-check config/tours (undefined auth profiles, empty `code_paths` matches, non-role selectors) without launching a browser |
| `npm run capture -- --tour <id>` | Screenshot one tour, every configured viewport |
| `npm run capture -- --tour <id> --tour <id2> ...` / `npm run capture -- --all` | Screenshot several tours in one run: one shared browser, batched with bounded concurrency (`--concurrency <n>`, default 3 — a tour with `preconditions.seed` always runs alone, never concurrently with another tour). Each tour's failure is isolated from its siblings; exits non-zero if any tour failed |
| `npm run capture -- --tour <id> --continue-on-error` | Keep going after a step fails instead of aborting the whole tour — the resulting manifest is marked `partial` (only the captures that actually succeeded) and `generate-docs.mjs` refuses to render it until a clean re-capture succeeds. Still exits non-zero |
| `npm run drift` | Show which tours changed, without generating anything |
| `npm run status` | Report which tours/product pages are dirty, clean, or gated, and when each was last generated |
| `npm run generate-docs -- --tour <id>` | Write/update that tour's tutorial page (add `--force` to override an edit-outside-keep-region warning) |
| `npm run generate-product-docs` | Write/update the overview/getting-started/concepts pages from `.autodocs/artifacts/prose/_product.json` (written by the `product-scribe` subagent) |
| `npm run prune` | Flag confirmed tours whose feature looks removed from the app (see "Archiving a removed feature") |
| `npm run archive-tour -- --tour <id>` | Archive one tour: flip its status, move its page under `docs/archive/` |
| `npm run verify-docs` | Check every image reference and internal link/anchor under `docs/` resolves (add `--build` to also build `site/`) — run before a docs PR opens |
| `npm run review-diffs` | Render a before/after/diff report for any screenshot about to be replaced — open `.autodocs/artifacts/diff-report.html` |
| `npm test` | Run the unit test suite (for anyone changing AutoDocs itself, not required to just use it) |

These are the exact same scripts `/autodocs:document` calls under the hood —
see "Developing on the plugin itself" below.

### CI (optional, off by default)

`.github/workflows/docs.yml` can run the whole pipeline in GitHub Actions
and open a PR with anything that changed, but it's parked on manual trigger
(`workflow_dispatch`) rather than firing automatically — this is a
solo-developer tool, so running things yourself is the default, not
something to set up before you can use AutoDocs. If you ever want it
automatic (e.g. on every merge to `main`), the job is ready; you'd flip its
`on:` trigger and set an `ANTHROPIC_API_KEY` repo secret.

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
  agents/tour-scout.md          Drafts a candidate tour via Playwright MCP (propose/map subcommands)
  agents/product-scribe.md      Writes grounded product-level prose from README/config/tour inventory
  scripts/                     The engine: capture.mjs, crawl.mjs, drift.mjs, generate-docs.mjs,
                                generate-product-docs.mjs, review-diffs.mjs,
                                design-scan.mjs (design-skill detection),
                                prune.mjs (orphan-tour detection), archive-tour.mjs (archives one),
                                lib/ (unit-tested helpers, incl. design.mjs, docgen.mjs, product.mjs)
demo-app/                  React + Vite app used to dogfood the plugin (login + dashboard)
tours/*.yaml               This repo's own tours — declarative feature walks
autodocs.config.yaml       This repo's own config: base URL, viewports, auth, masks, threshold, docs layout
docs/                      This repo's own generated tutorials (images + markdown); edits inside
                           `<!-- autodocs:keep -->` blocks survive regeneration
docs/overview.md           Generated product overview page + linked tutorial index (see "It also
                           documents the product itself" above)
docs/getting-started.md   Generated install/run/config page
docs/concepts.md           Generated core-vocabulary page
docs/_sidebar.autodocs.json Generated ordering/grouping payload the scaffolded site's sidebar reads
docs/archive/              Tutorials for removed features — see "Archiving a removed feature" above
.autodocs/doc-style.json  Distilled design-skill output (page layout knobs) — committed, not gitignored
.autodocs/artifacts/       Capture output + state.json lockfile (gitignored)
site/                      Docusaurus site serving docs/ directly (no content duplication)
.github/workflows/docs.yml Optional CI: parked on manual trigger — see "CI" under "Advanced topics" above
```

Everything under `plugin/` is what gets installed elsewhere; everything else
in this list is this repo's own dogfood project (same relationship as any
app that happens to use its own product).

## Project status

Every phase of the original build plan is done: capture, drift gating,
grounded generation, plugin packaging, publishing, hardening (multi-viewport,
default masks, diff review, edit-safety guard), and assisted tour discovery.
See `autodocs-implementation-brief.md` for the phase-by-phase acceptance
criteria this was built against. Since then: orphan-tour detection and
archiving (`/document prune`, folded into `map`) — the reverse of assisted
discovery, for when a feature is removed instead of added.

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
