# CLAUDE.md — AutoDocs

## Project goal

AutoDocs is a Claude Code–native pipeline that drives a running web app in a
headless browser, captures feature screenshots, generates tutorial-style
Markdown documentation, and keeps it in sync as the app ships — packaged as a
reusable Claude Code plugin. Full architecture, component specs, and phased
build order live in `autodocs-implementation-brief.md`; the locked decisions
from the Open Questions (target app, publisher, capture driver, run trigger,
screenshot storage, scribe model) are recorded in the approved implementation
plan for this project.

**Branding note:** this is an independent personal project, unrelated to any
other brand. Do not apply Mirai (or any other) brand styling here even if a
parent-directory `CLAUDE.md` suggests it — use plain, generic styling unless
told otherwise.

## Working routines

### Testing
- Any new function, script, or component ships with unit tests in the same
  change. Test framework: **Vitest** (pairs naturally with the Vite-based
  `demo-app` and works fine for the plain Node scripts under `scripts/`).
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

## Tour and doc-generation conventions

- **Selectors**: role/accessibility locators first (`role=button[name='...']`),
  CSS only as a fallback for things with no meaningful role.
- **Masking**: any volatile region (timestamps, avatars, live counts) must be
  in a capture's `mask` list. Masking redacts the region from both the saved
  screenshot and its hash — that's what keeps drift detection from firing on
  content that changes every run regardless of real UI changes.
- **Never invent UI**: prose generation grounds strictly in the a11y snapshot
  captured alongside each screenshot. An element not in that snapshot doesn't
  get described, no matter how plausible it would be for this kind of page.
- **Surgical updates**: regenerating a tour's page only touches that page;
  content inside `<!-- autodocs:keep --> ... <!-- /autodocs:keep -->` is
  human-owned and must survive every regeneration untouched.
- Tours are hand-authored (`tours/*.yaml`) — nothing auto-generates them by
  crawling the app. Playwright MCP (`.mcp.json`, project-scoped) exists for
  *interactively* authoring a new tour with a human at the keyboard, not for
  autonomous discovery.

## Reference
- `autodocs-implementation-brief.md` — full architecture, phases, acceptance
  criteria, and open questions.
- Locked decisions (from this project's approved plan): demo React/Vite app
  as first target, direct Playwright (not MCP) for capture, Docusaurus as
  publisher, merge-to-main as the doc-PR trigger, git-committed
  pixel-diff-gated screenshots, Sonnet as the doc-scribe model.
