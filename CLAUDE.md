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
- This section is about developing AutoDocs itself (this repo). The
  `/document` skill it ships now follows the same shape independently, in
  whatever *target* project it's run against — see "Tutorial-need check"
  below and `plugin/skills/document/SKILL.md`'s "Autonomy" section: docs land
  on the feature's own branch (or a fresh `docs/<slug>` branch off `main`),
  get pushed, and get a PR opened — never merged automatically there either.

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
- **By default this now carries all the way through**: once tour-scout's
  draft is in hand, `/document propose` itself validates it, flips `status`
  to `confirmed` and `maturity` to `stable`, runs capture/generate, and opens
  a docs PR — all without stopping to ask, unless it hits one of the hard
  stops in `plugin/skills/document/SKILL.md`'s "Autonomy" section (tour-scout
  couldn't ground the feature, an unverified voice flow, a `validate` error,
  an unrecorded auth session, or a hand-edited page it won't silently
  overwrite). Append `--review` to `propose`/`map`/the normal run to fall
  back to the previous behavior: draft, report, and wait for a human to flip
  `status: confirmed` themselves. This is Phase 7 ("assisted tour discovery")
  in the brief, now with the autonomous default layered on top — the PR it
  opens is the review point, and it is never auto-merged.

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
- **Highlighting**: a capture step's optional `highlight` field (a role=/text=
  locator, same convention as `Selectors` above) outlines that element in the
  screenshot itself — deterministic CSS (`capture.mjs`'s `buildHighlightCss`),
  never anything animated, so the masked hash stays stable run to run. Checked
  fresh per viewport (an element visible at desktop may be hidden at mobile)
  and never fails the capture — a missing/hidden target just means that
  viewport's shot has no highlight, logged as a warning. Only valid on a
  capture step, not an action step. Adding or changing a `highlight` changes
  that step's screenshot pixels, so it goes through the normal pixel-diff
  gate like any other visual change — run `npm run review-diffs` before
  shipping. The color is a neutral default, overridable per-project via
  `.autodocs/doc-style.json`'s `page.highlightColor` (a design skill's accent
  color) — presentation only, same guardrail as everything else that file
  touches.
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
- **Page layout vs. design-skill styling — presentation only, never content.**
  `autodocs.config.yaml`'s `docs:` section (`primaryViewport`,
  `collapseOtherViewports`) picks which viewport's screenshot stays inline
  per step versus collapses into a `<details>` block (`lib/docgen.mjs`'s
  `renderTourPage`). `/document` also auto-detects a project's own
  design/brand skill (if any — `lib/design.mjs`'s `discoverDesignSkills`,
  never a parent directory's `CLAUDE.md`) and distills it into a **committed**
  (not gitignored — generated docs depend on it) `.autodocs/doc-style.json`
  plus the scaffolded Docusaurus site's theme. Both of these change how a
  page *looks* — heading text, viewport labels, colors/fonts/logo — and
  never what `doc-scribe` writes or which UI a tour describes; never inject
  a skill's tagline or marketing copy into a generated page. This repo's own
  `CLAUDE.md` (top of this file) opts this project out of the unrelated
  parent REDACTED brand for exactly this reason — auto-detection must keep
  respecting that, never fall back to a parent `CLAUDE.md`'s styling rules.
  A change to either the `docs:` block or `doc-style.json` re-renders every
  existing page on the next `/document` run automatically (folded into each
  tour's render hash, alongside its screenshot/code_paths hashes in
  `drift.mjs`'s dirty check) — no `--force` needed, and no new `doc-scribe`
  dispatch either, since existing prose is still grounded when only the
  render hash changed.
- Tours are hand-authored (`tours/*.yaml`) or drafted by `tour-scout` via
  `/document propose`/`map` (Phase 7 — see below). `/document map`'s crawl
  (`plugin/scripts/crawl.mjs`) is **authenticated by default** (`--all-auth`:
  once per configured `auth` profile, plus a signed-out pass, merged and
  tagged with `reachedBy`) and directly visits every route the code-review
  step finds in source (`--routes-file`, the "confirmation crawl") — a route
  reachable only behind a role or only via in-app navigation still gets
  found, not just what an anonymous link-crawl happens to reach. A profile
  whose session isn't recorded yet is skipped per-pass, not fatal — the rest
  of the crawl still runs, and the report says which role's coverage may be
  incomplete. Nothing crawls the app to invent a full tour set on install —
  Playwright MCP (`plugin/.mcp.json`,
  bundled with the plugin so it travels to any project it's installed into)
  exists for *interactively* authoring a new tour with a human at the
  keyboard, whether by hand or via tour-scout. A tour's `status` (default
  `confirmed`) is separate from its `maturity`: `status: proposed` means a
  tour was suggested but not yet reviewed — the drift gate and `/document`
  both skip it, same as `maturity: draft`, until it's flipped to `confirmed`.
  By default `/document propose`/`map` flip it themselves once validation
  passes (see "Tutorial-need check" above); `--review` keeps that flip a
  human decision instead.
- **`status: archived`** is the third value: a tour whose feature AutoDocs
  can no longer find in the app — removed, renamed, or moved — rather than
  one still awaiting review. `/document map`'s own reconciliation (the
  reverse of its gap-detection: `plugin/scripts/lib/prune.mjs`'s
  `findOrphanTours`, exposed standalone as `/document prune`) flags a
  candidate on two purely mechanical signals, no framework-routing judgment
  call needed here unlike the gap side: `code_paths` that used to resolve to
  real files and no longer does, or none of the tour's `goto` paths
  appearing in a fresh crawl/code-review pass. `plugin/scripts/archive-
  tour.mjs` is the only thing that acts on a flagged tour, and it only ever
  **archives** — flips `status`, moves `docs/<id>.md` (and its images) under
  `docs/archive/` with a banner, never deletes `tours/<id>.yaml` or any doc
  content, so a wrong call is a one-line revert. An archived tour is
  permanently skipped by capture/drift/generate/validate, same shape as
  `draft`/`proposed` (see `lib/drift.mjs`'s `isTourDirty`), but unlike those
  two its page survives, filed under the site's autogenerated "Archive"
  section (`docs/archive/_category_.json`) instead of just disappearing.
- **Product pages ground in the repo, never the browser.** `/document
  product` (folded into the normal pipeline too — `lib/product.mjs`) writes
  `docs/overview.md`/`getting-started.md`/`concepts.md` via the
  `product-scribe` subagent, describing the product itself rather than one UI
  flow. Its ground truth is `README.md`, `package.json`, `.env.example`,
  `autodocs.config.yaml`, any extra `product.sources` globs, and the
  confirmed tour inventory — `lib/product.mjs`'s `collectProductSources`
  explicitly denies `.env` itself, key/credential-shaped files, and anything
  under `.auth/`, no matter what a glob matches, same untrusted-config
  posture as everywhere else config feeds a subagent's `Read` list. Same
  "never invent" discipline as `doc-scribe`, and the same presentation-vs-
  content scope guardrail: a page product-scribe couldn't ground is skipped
  and reported, never padded, and the design-skill/`docs:` styling above
  applies to these pages identically — never a tagline, never invented
  content, presentation only. Every tour page also carries a
  `sidebar_position` (product pages pin above them at 1–3), computed from
  `docs.sections` config order when set, else alphabetical — grouping into
  named sections is opt-in, ordering isn't; `docs/_sidebar.autodocs.json`
  (written by `generate-product-docs.mjs`) is what `/document init-site`
  wires the scaffolded site's sidebar to build from.

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
  `generate-product-docs`/`review-diffs`/`test` scripts point into
  `plugin/scripts/`** — that's how this repo dogfoods its own plugin against
  the bundled demo app without a
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
