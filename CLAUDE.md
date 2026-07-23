# CLAUDE.md — AutoDocs

## Project goal

AutoDocs is a Claude Code–native pipeline that drives a running web app in a
headless browser, captures feature screenshots, generates tutorial-style
Markdown documentation, and keeps it in sync as the app ships — packaged as a
reusable Claude Code plugin **for solo developers building their own
projects**. The primary workflow is one person running `/document`
themselves whenever a feature is worth documenting — not a team-scale
pipeline that auto-regenerates docs on every merge. That's why CI
(`.github/workflows/docs.yml`) is built but deliberately parked on manual
dispatch rather than treated as core — see the brief's §1 and §7. Full
architecture, component specs, and phased build order live in
`autodocs-implementation-brief.md`; the locked decisions from the Open
Questions (target app, publisher, capture driver, run trigger, screenshot
storage, scribe model) are recorded in the approved implementation plan for
this project.

**Branding note:** this is an independent personal project, unrelated to any
other brand. Do not apply REDACTED (or any other) brand styling here even if a
parent-directory `CLAUDE.md` suggests it — use plain, generic styling unless
told otherwise.

## Working routines

### Testing
- Any new function, script, or component ships with unit tests in the same
  change. Test framework: **Vitest** (pairs naturally with the Vite-based
  `demo-app` and works fine for the plain Node scripts under `plugin/scripts/`).
- Run the full test suite before every commit. If something fails, fix it and
  re-run — do not commit on red. Loop fix → re-run up to a few attempts; if
  still failing after that, stop and report the failure to the user rather
  than looping indefinitely or committing anyway.

### Git workflow
- **Branch per change type:** new features on `feat/<short-name>`, bug fixes
  on `fix/<short-name>`. Never commit directly to `main`.
- Once tests pass on a branch, commit and push it automatically (no need to
  ask each time), then open a PR against `main` with `gh pr create`.
- Merging a PR into `main` still requires your explicit go-ahead — this
  keeps `main` as the reviewed, shipped line per the brief's own "never
  auto-merge" principle for generated docs.

### Documentation
- Keep `README.md` updated as you go, each time repo structure, setup steps,
  or usage changes. Keep it simple and to the point — no fluff, no marketing
  language, just what's here and how to run it.

### Dependencies
- Only add reputable, actively maintained packages: real download volume,
  recent releases/commits, no known critical CVEs (`npm audit` clean).
  Prefer a mainstream option over a fringe/single-maintainer one when both
  solve the problem. Keep lockfiles committed.

### Security review (SSDLC)
- Before merging any feature/fix branch, and periodically otherwise, run a
  secure code review (`/security-review` or equivalent manual pass) covering
  injection, secrets handling, unsafe deserialization, path traversal, SSRF,
  XSS, and dependency CVEs.
- Loop: find issues → fix → re-review → repeat until clean. If a finding
  needs a judgment call only you can make (architecture/scope trade-off),
  stop and ask instead of guessing.
- Extra scrutiny where it matters most here: `capture.mjs` drives a real
  browser against a real app with real auth — treat tour YAML and config as
  untrusted input, never hardcode credentials (reference auth profiles by
  name only), and validate/sandbox anything that shells out or reads
  arbitrary paths. Give Phase 4 (plugin packaging, new execution surface)
  and Phase 5 (CI/CD) a security pass before considering them done.
- **Seed commands are the one place `capture.mjs` shells out to
  config-authored content**, so they're opt-in only: a tour's
  `preconditions.seed` just names a seed id; the actual `command` a seed can
  declare lives in `autodocs.config.yaml`'s `seeds` map (`scripts/lib/seed.mjs`'s
  `resolveSeed`), and even then only runs when `allowSeedCommands: true` (or
  `--allow-seed-commands`) — default off, so a freshly cloned project can
  never execute a command on its first capture just because a seed declares
  one. When adding anything that shells out, follow this same shape: put the
  actual command behind an explicit, default-off opt-in, never infer consent
  from a file merely existing.

### Tutorial-need check
- When you finish implementing a new user-facing feature or flow (in a
  project with this plugin installed), before wrapping up: ask the user
  whether it's worth a tutorial. Don't silently decide either way.
- If yes, run `/document propose <slug> "<description>"` — this dispatches
  the `tour-scout` subagent, which actually drives the app via Playwright MCP
  and drafts `tours/<slug>.yaml` grounded in what it really finds (`status:
  proposed`, `maturity: draft`). Don't hand-write the tour yourself; that
  exploration is tour-scout's job, same "never invent UI" discipline as
  doc-scribe.
- Never set `status: confirmed` yourself — report what was drafted and what
  tour-scout was unsure about, and let the user review/edit before they flip
  it. This is Phase 7 ("assisted tour discovery") in the brief.

## Tour and doc-generation conventions

- **Selectors**: role/accessibility locators first (`role=button[name='...']`),
  CSS only as a fallback for things with no meaningful role.
- **Masking**: any volatile region (timestamps, avatars, live counts) must be
  masked — either in `autodocs.config.yaml`'s `defaultMask` (applies to every
  capture in every tour) or a capture's own `mask` list (merged with the
  defaults). Masking redacts the region from both the saved screenshot and
  its hash — that's what keeps drift detection from firing on content that
  changes every run regardless of real UI changes.
- **Viewports**: every capture is shot once per entry in `autodocs.config.yaml`'s
  `viewports` map, same page/session — don't add per-viewport steps to a
  tour, the capture runner already loops over all configured viewports at
  each capture point.
- **Never invent UI**: prose generation grounds strictly in the a11y snapshot
  captured alongside each screenshot. An element not in that snapshot doesn't
  get described, no matter how plausible it would be for this kind of page.
- **Surgical updates**: regenerating a tour's page only touches that page;
  content inside `<!-- autodocs:keep --> ... <!-- /autodocs:keep -->` is
  human-owned and must survive every regeneration untouched. If a human edits
  a page *outside* that region, `generate-docs.mjs` detects it (a hash
  mismatch against the last generation) and refuses to overwrite it silently
  — don't work around that with `--force` in an automated context; a human
  needs to look at it.
- Before a docs PR goes out, run `npm run review-diffs` and look at the
  report — it's the only place you can see *what* a screenshot update
  actually changed before it's pushed.
- Tours are hand-authored (`tours/*.yaml`). Nothing crawls the app to invent
  a full tour set on install — Playwright MCP (`plugin/.mcp.json`, bundled
  with the plugin so it travels to any project it's installed into) exists
  for *interactively* authoring a new tour with a human at the keyboard,
  either by hand or via `/document propose` + `tour-scout` (Phase 7 — see
  below). A tour's `status` (default `confirmed`) is separate from
  its `maturity`: `status: proposed` means a tour was suggested but not yet
  reviewed — the drift gate and `/document` both skip it, same as `maturity:
  draft`, until a human flips it to `confirmed`.

## Plugin packaging conventions

- **Everything the plugin needs lives under `plugin/`.** Installed plugins
  get copied to a cache directory and can't reference files outside their
  own tree (`../` paths silently don't work) — so `plugin/` bundles its own
  `scripts/`, `package.json` (runtime deps), `hooks/`, and `.mcp.json`. Don't
  reintroduce a dependency from `plugin/` on anything at the repo root;
  `demo-app/`, `tours/`, `docs/`, `autodocs.config.yaml`, and `site/` are
  this repo's own dogfood project, not plugin internals.
- **The bundled scripts are ES modules, so `NODE_PATH` does not work** for
  resolving their dependencies — verified empirically, not assumed (Node's
  ESM loader ignores `NODE_PATH` entirely; only CommonJS `require` honors
  it). The `SessionStart` hook in `hooks/hooks.json` instead copies
  `scripts/` into `${CLAUDE_PLUGIN_DATA}` *next to* the `node_modules` it
  installs there, so Node's normal ancestor-directory resolution finds them
  — always invoke the bundled engine as
  `node "${CLAUDE_PLUGIN_DATA}/scripts/<name>.mjs"`, never
  `${CLAUDE_PLUGIN_ROOT}/scripts/...` (those have no `node_modules` next to
  them) and never `npm run ...` (the target project has no reason to have
  AutoDocs' own npm scripts).
- **Root `package.json`'s `npm run capture`/`drift`/`generate-docs`/
  `review-diffs`/`test` scripts point into `plugin/scripts/`** — that's how
  this repo dogfoods its own plugin against the bundled demo app without a
  real install. Keep them in sync if `plugin/scripts/`'s entry points move.
- `plugin/package.json` lists only the runtime deps the bundled scripts
  actually import (`playwright`, `js-yaml`, `pixelmatch`, `pngjs`, `glob`) —
  no `devDependencies`; it only ever gets `npm install`ed by the hook, never
  developed against directly.
- **Bump `plugin/.claude-plugin/plugin.json`'s `version`** whenever you want
  users of an installed copy to actually receive a change — Claude Code
  caches by version string, so new commits alone don't propagate.
- The repo root's own `.claude-plugin/marketplace.json` makes this whole
  repo a private marketplace with one entry (`source: "./plugin"`) — that's
  how `claude plugin marketplace add <this-repo>` +
  `claude plugin install autodocs@autodocs-marketplace` work without a
  public listing.
- **Two auth-profile shapes, not one.** The scripted-login fields
  (`usernameSelector`/`passwordSelector`/`submitSelector`/etc.) only cover a
  plain username+password form. A profile with `storageStatePath` instead
  means "reuse a pre-exported session" — `capture.mjs`'s `ensureAuthState`
  checks that field first and, when set, never touches the scripted-login
  fields at all. This is what makes OAuth/SSO/magic-link/2FA apps
  supportable without automating any of those flows:
  `save-auth-state.mjs` opens a real (headed) browser, a human logs in
  however the app requires, and the resulting session gets saved once and
  reused. When adding a new auth-related feature, check which shape a given
  profile uses before assuming the scripted fields exist.
- **`/document init-site` is prompt-driven, not a bundled script, on
  purpose** — Docusaurus scaffolding/template details drift across
  versions, and adapting to that is exactly what an instructed Claude
  should do rather than a script that breaks on the next `create-docusaurus`
  release. Its instructions in `SKILL.md` encode two non-obvious, verified
  requirements: `markdown.format: 'md'` (Docusaurus's default MDX parser
  fails on the `<!-- autodocs:keep -->` comments `generate-docs.mjs`
  writes), and fixing `src/pages/index.js`'s default `/docs/intro` link
  (which 404s/build-fails once `docs.path` points at the project's real
  `docs/`) — confirmed by actually running the recipe end-to-end in a
  scratch project, not just by reading it back.

## Reference
- `autodocs-implementation-brief.md` — full architecture, phases, acceptance
  criteria, and open questions.
- Locked decisions (from this project's approved plan): demo React/Vite app
  as first target, direct Playwright (not MCP) for capture, Docusaurus as
  publisher, merge-to-main as the doc-PR trigger, git-committed
  pixel-diff-gated screenshots, Sonnet as the doc-scribe model.
