---
name: document
description: Captures the current project's tours, regenerates docs for whichever tours actually changed via the doc-scribe subagent, and ships the result as a docs PR — by default, end-to-end, without stopping for review at each step (never auto-merged). Invoke with a tour's file slug to limit the run to one tour (e.g. "/document dashboard"); with no argument, runs across every tour in tours/*.yaml. Invoke as "/document propose <slug> \"<description>\"" to draft a new candidate tour for a feature you just implemented via the tour-scout subagent, then — unless tour-scout flags something it couldn't ground — auto-validate, auto-confirm it, and carry it through capture/generate/ship in the same invocation. Invoke as "/document map" (optionally "/document map --interactive") to automatically discover an app's features via a dynamic crawl plus a code review, draft tours for every discovered gap, and ship them the same way. Append "--review" to the normal run, propose, or map to fall back to the old stop-and-ask-at-each-step behavior instead. Invoke as "/document validate" to preflight-check config/tours (undefined auth profiles, empty code_paths globs, non-role selectors) without launching a browser. Invoke as "/document init-site" to scaffold a Docusaurus site serving this project's docs/ folder. Works in any project — it bootstraps autodocs.config.yaml and tours/ the first time it's run there.
argument-hint: "[tour-id] [--review] | propose <slug> \"<description>\" [--review] | map [--interactive] [--review] | validate | init-site"
allowed-tools: Bash(git *) Bash(gh pr *) Bash(node *) Edit
---

Arguments: $ARGUMENTS

All commands below run against `${CLAUDE_PROJECT_DIR}` (the project you're
in) using the AutoDocs engine bundled with this plugin, copied to
`${CLAUDE_PLUGIN_DATA}/scripts/` on session start (see `hooks/hooks.json`) —
run every script as `node "${CLAUDE_PLUGIN_DATA}/scripts/<name>.mjs" ...`,
never `npm run ...`; the project you're documenting has no reason to have
AutoDocs' own npm scripts.

## Autonomy

By default, every mode below (the normal pipeline, `propose`, and `map`) runs
end-to-end to an opened docs PR without stopping for review at each
intermediate step — that single PR (never auto-merged) is the review point.
This applies everywhere except the **hard stops** below, where a run always
stops and reports instead of pushing through:

- `tour-scout` reports it couldn't ground the feature (not found on the page,
  an upload/voice fixture it needed but wasn't given and couldn't
  self-author, a CAPTCHA, a real third-party OAuth/consent screen, or a
  sensitive field it refused to fill).
- The drafted tour includes a **voice/microphone** step — tour-scout always
  flags these `unverified`, since its session may not have the fake-microphone
  wiring active; that needs a real capture run to confirm before it's trusted.
- `validate.mjs` reports an **`error`** finding for the tour in question (e.g.
  an undefined `preconditions.auth` profile) — `warn` findings don't block.
- `capture.mjs` needs a `storageStatePath` auth session that hasn't been
  recorded yet — this genuinely needs a human at a headed browser (see Step 1
  under "Steps" below); relay the exact `save-auth-state.mjs` command and
  stop.
- `generate-docs.mjs` refuses because a page was hand-edited outside a
  `<!-- autodocs:keep -->` region (hash mismatch) — never `--force` past this;
  a human needs to look.
- `map --interactive` still requires the out-loud dev-environment
  confirmation in its own preflight step before crawling with synthetic form
  submission — required in both autonomous and `--review` mode, never
  skipped.

**`--review`**, appended to the normal run, `propose`, or `map`, restores the
previous stop-and-ask-at-each-step behavior for anyone who wants to stay
hands-on: draft or capture, report, and wait — rather than auto-validating,
auto-confirming, generating, and shipping.

Whichever mode you're in, **never auto-merge** a docs PR into `main` —
opening (or updating) it is as far as autonomy goes; merging stays the
human's explicit call.

## Step 0 — first run in this project: bootstrap

If `${CLAUDE_PROJECT_DIR}/autodocs.config.yaml` doesn't exist yet, this is
the first time `/document` has run here. Before anything else:

1. Ask the user for the app's local base URL (e.g. `http://localhost:3000`)
   — don't guess a port.
2. Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/init-project.mjs" --base-url <url>
   ```
   This writes a real, valid `autodocs.config.yaml` at the project root
   (live `baseUrl`/`viewports`/`outputDir`, plus every optional section —
   both `auth` shapes, `defaultMask`, `pixelDiffThreshold`, `seeds` — as
   commented-out examples right there in the file, so there's no dead
   pointer to chase down later). It also creates an empty `tours/` directory
   with a short `tours/README.md` "what's next" pointer, and — security-
   critical, don't skip or reimplement this by hand — merges `.autodocs/artifacts/`
   and `.env` into the project's `.gitignore` (idempotently; safe to re-run)
   so a live session-cookie file or scripted-login credentials can't get
   committed by accident, plus a `.env.example` if one doesn't already
   exist. If it reports the config already exists, this project was already
   bootstrapped — don't overwrite it, just report that and move on to the
   arguments below.
3. Tell the user plainly: there are no tours yet. The fastest way to get one
   is `/document propose <slug> "<description>"` after implementing a
   feature — by default this runs all the way through to an opened docs PR
   (see "Autonomy" above); append `--review` if you'd rather review the
   draft yourself before it's confirmed and shipped. Once at least one tour
   is `confirmed` and `/document` has generated its page, `/document
   init-site` scaffolds a browsable docs site for `docs/`. Then stop; there's
   nothing to capture/generate until a tour exists.

If `autodocs.config.yaml` already exists, skip straight to the arguments
below.

Parse `--review` out of the arguments wherever it appears (it's a flag, not
positional) before matching what's left against the modes below — its
presence puts this run in review mode (stop-and-ask, matching every behavior
before autonomy existed); its absence means autonomous mode, the default
described in "Autonomy" above. This applies to every mode below, not just the
normal pipeline.

If the arguments start with `propose`, follow **"Propose a new tour"** below.
If the arguments start with `map`, follow **"Map the whole app"** below.
If the arguments are `validate`, follow **"Validate a project"** below.
If the arguments are `init-site`, follow **"Scaffold a docs site"** below.
Otherwise: run the AutoDocs pipeline — capture → drift gate → dispatch dirty
tours to the `doc-scribe` subagent → regenerate → summarize → ship. If a tour
file slug was given, operate on just `tours/<slug>.yaml`; with no argument,
operate on every `*.yaml` file in `tours/`.

## Propose a new tour

Parses as `propose <slug> "<description>" [--review]` — e.g.
`/document propose dashboard-export "the new Export CSV button on the dashboard"`.
This is the Phase 7 "assisted tour discovery" entry point (see the brief and
CLAUDE.md's "Tutorial-need check"): drafts a candidate tour via tour-scout,
then — in the default autonomous mode — carries it through validation,
confirmation, capture, generation, and shipping in the same invocation,
stopping early only at a hard stop (see "Autonomy" above).

1. Confirm `tours/<slug>.yaml` doesn't already exist — if it does, stop and
   ask rather than overwrite it.
2. Compute candidate `code_paths`: `git diff --name-only` against the base
   branch (or recent commits if already merged) for files that plausibly
   back this feature — frontend source under the app's directory, not
   config/test/build files.
3. List existing tour files (`tours/*.yaml`, excluding the target slug —
   there may be none on a brand-new project). tour-scout has no directory-
   listing tool of its own (only `Read`/`Write`/Playwright MCP, kept
   minimal on purpose) — pass this filename list to it directly rather than
   letting it guess, so it can actually read one or two for
   title/intent/selector conventions instead of silently skipping that step.
   Same reason: if `fixtures/` exists, list its files too (may not exist at
   all on a project with no upload- or voice-gated flows yet) — a flow that
   needs a file upload (e.g. importing a CSV or a sample data file) or
   voice/microphone input (a `.wav` fixture) can only be drafted for real if
   tour-scout knows a usable fixture is already there.
4. Invoke the `tour-scout` subagent with: the slug, the description verbatim,
   the candidate `code_paths` list, the existing tour filenames and fixture
   filenames from step 3, and the app's `baseUrl` (from
   `autodocs.config.yaml`). Wait for it to write `tours/<slug>.yaml` — don't
   draft the tour yourself, that exploration is tour-scout's job, grounded in
   what it actually finds by driving the app.
5. **Check for a hard stop.** Read tour-scout's own report. Any of these
   means this run stops here, same as `--review` mode — report what was
   drafted and why it's not going further, and skip straight to step 7:
   - it couldn't ground the feature at all, or skipped a step it couldn't
     find
   - it flagged an upload/voice fixture it needed but wasn't given and
     couldn't self-author
   - the tour includes a voice/microphone step (always `unverified`)
   - it flagged a sensitive field (SSN/payment/etc.) it refused to fill
6. **In `--review` mode, or after a hard stop above:** report what was
   drafted, and tour-scout's own notes on what it's unsure about. Tell the
   user plainly: review the steps/selectors, fill in `preconditions`/`mask`
   if needed, review any form values or upload fixtures tour-scout filled in
   with synthetic placeholder data (it flags these explicitly — swap in
   something more representative if you want less obviously-fake data in the
   generated docs). If the tour includes a voice/microphone flow, relay
   tour-scout's own caveat that it's **unverified** — its session may not
   have been able to exercise the fake-microphone flow live, so that part
   specifically needs a real capture run to confirm before trusting it. Then
   flip `status` to `confirmed` yourself once you're satisfied — nothing
   downstream (drift gate, `/document`'s normal pipeline) treats this tour as
   real until it is. Suggest `/document validate` once it's filled in, to
   catch an undefined auth profile or an empty `code_paths` match before the
   first real capture.

   **In autonomous mode with no hard stop, instead:**
   1. Run `node "${CLAUDE_PLUGIN_DATA}/scripts/validate.mjs"`. An `error`
      finding for this tour is a hard stop too — report it and stop here,
      same as step 5, rather than confirming a tour that would fail partway
      through capture. A `warn` finding doesn't block.
   2. `Edit` `tours/<slug>.yaml` with two targeted line replacements —
      `maturity: draft` → `maturity: stable` and `status: proposed` →
      `status: confirmed` — not a full YAML rewrite, so `tour-scaffold.mjs`'s
      explanatory comments survive untouched.
   3. Fall straight into **Steps 1–5** under "Steps" below for this one slug
      (capture → drift → doc-scribe → generate). Then run **Step 6 (Ship)**
      to commit, push, and open or update the PR.
7. Report what happened: what was drafted, tour-scout's uncertainties, and
   either what was shipped (branch/PR link) or why the run stopped short
   (which hard stop was hit, or `--review` mode).

## Map the whole app

Parses as `map [--interactive] [--review]` (add `--interactive` to also
enable the crawler's opt-in mutating exploration — see the safety note in
step 1 below). This is the "map all features automatically" entry point: it
combines a dynamic crawl of the running app with your own reading of its
source code, then proposes a feature list and a doc structure — and, in the
default autonomous mode, drafts and ships tours for every discovered gap
without asking which ones first (see "Autonomy" above for the hard stops that
still apply, per feature). Same "propose, then carry through" discipline as
**"Propose a new tour"** above, just applied across many candidate features
at once instead of one you were told about.

1. **Preflight.** Config must exist (Step 0 above bootstraps it if not). If
   `--interactive` was requested, this crawl fills in and submits
   safe-looking forms with synthetic data on the real running app —
   **confirm out loud with the user that `baseUrl` points at a throwaway or
   dev environment, not anything with real data**, before proceeding (in both
   autonomous and `--review` mode — this confirmation is never skipped).
   `crawl.mjs` itself refuses to run interactively unless
   `crawl.allowInteractive: true` is also set in `autodocs.config.yaml` (see
   the README's "Mapping a whole app automatically") — if it reports that,
   that config flag still needs to be turned on deliberately; don't work
   around it by any other means.
2. **Crawl.** Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/crawl.mjs" [--interactive]
   ```
   Writes `.autodocs/artifacts/site-map.json` — every same-origin route it
   reached, with the buttons/forms/links found there. This proves
   *reachability*; it doesn't replace reading the code (next step), since a
   route can exist without being linked from anywhere the crawl's auth
   profile could reach (e.g. gated behind a role it doesn't have).
3. **Code review.** Read the app's routing/pages source — adapt to whatever
   the project actually uses (React Router config, Next.js/SvelteKit
   file-based routing, a Vue Router table, etc.), there's no one bundled
   parser for this on purpose (framework conventions and versions drift;
   this is exactly the kind of judgment call you're better suited for than
   a brittle script — same reasoning as `init-site` below). Enumerate real
   features: each one's route, a short description, and its backing
   `code_paths`. Reconcile against `site-map.json`: a route the crawl
   reached confirms real UI is there; a route only found in code (no crawl
   entry) gets flagged as possibly unreachable/gated, not silently dropped
   or silently assumed real.
4. **Write the doc plan.** Write `.autodocs/artifacts/doc-plan.md`: the
   reconciled feature list — slug (run each through the same
   lowercase-kebab-case rule `tours.mjs`'s `assertSafeSlug` enforces),
   route, one-line description, `code_paths`, and whether an existing
   `tours/*.yaml` already covers it — grouped into a suggested doc structure
   (an ordered list of sections, e.g. Getting Started → core features →
   settings/admin). This is the "structure the documentation properly"
   deliverable, and doubles as the audit trail for what got drafted below.
5. **Autonomous mode: draft every gap feature.** For each feature in the doc
   plan not already covered by an existing tour, dispatch the `tour-scout`
   subagent exactly as in "Propose a new tour" step 4 (slug, description,
   candidate `code_paths`, existing tour/fixture filenames), additionally
   passing that route's affordances from `site-map.json` as a hint —
   tour-scout still verifies everything live via Playwright MCP itself; the
   site map only points at where to look first. One dispatch per feature.
   Every draft lands `status: proposed`, same as `propose`. Then, per drafted
   tour, apply "Propose a new tour" steps 5–6 (hard-stop check, then
   validate → auto-confirm → Steps 1–5 capture/generate) — but skip that
   tour's own Step 6 Ship; a hard stop on one feature doesn't stop the
   others, just note it and move on. Shipping for every feature drafted this
   run happens once, together, in step 6 below.

   **`--review` mode: present and ask instead.** Show the user the
   discovered feature list (already covered vs. gaps) and the proposed
   structure. Ask which gap features to draft tours for now — don't draft
   all of them; for each one picked, dispatch `tour-scout` the same way, but
   stop after the draft (the review path in "Propose a new tour" step 6)
   rather than auto-confirming.
6. **Ship.** Autonomous mode only, once every feature's dispatch this run has
   completed Steps 1–5: run **Step 6 (Ship)** under "Steps" below a single
   time, covering every tour confirmed and generated this run together — one
   commit, one PR, rather than one per tour.
7. **Report.** What was discovered, what's already covered, the proposed
   structure, what was drafted this run (and tour-scout's own uncertainties
   for each), which ones hit a hard stop and why, and — in autonomous mode —
   the branch/PR that was shipped, or — in `--review` mode — the reminder to
   review, flip `status: confirmed`, then `/document validate` and the
   normal pipeline.

## Validate a project

Preflight-checks `autodocs.config.yaml` and every tour under `tours/` without
launching a browser — catches problems that would otherwise only surface
mid-run (an undefined `preconditions.auth` profile fails partway through
`capture.mjs`, after it's already launched a browser). Run:

```
node "${CLAUDE_PLUGIN_DATA}/scripts/validate.mjs"
```

It reports, per tour: `ok`, or a list of `error`/`warn` findings — an
undefined `preconditions.auth` profile is an **error** (capture would fail
on it), while an empty `code_paths` glob match, a not-yet-recorded
`storageStatePath` session, or a non-`role=`/`text=` interactive selector are
**warnings** (things still run, just not as intended). Report the output
plainly; don't silently fix a tour yourself — a human authored or confirmed
it. Recommend running this after authoring/confirming a tour and before the
normal pipeline, especially right after `propose` drafts one.

## Scaffold a docs site

`init-site` sets up a [Docusaurus](https://docusaurus.io/) site in this
project that serves its `docs/` folder directly — no separate content
duplication. This is prompt-driven rather than a bundled script on purpose:
scaffolding tool versions and templates drift, and adapting to that is
exactly the kind of thing you're better suited for than a brittle script.
Follow the exact recipe below — it's proven, not a guess (this plugin's own
repo runs it):

1. If `${CLAUDE_PROJECT_DIR}/site/` already exists, stop and ask rather than
   overwrite it.
2. Scaffold: `npx create-docusaurus@latest site classic --javascript --skip-install`.
3. Remove the sample content you don't want: `site/blog/`, `site/docs/`
   (the site reads the project's real `docs/` instead — see step 4), and any
   unused sample images under `site/static/img/` (check
   `site/docusaurus.config.js` for what's actually referenced — usually just
   `favicon.ico` — before deleting the rest).
4. Edit `site/docusaurus.config.js`:
   - `title`/`tagline` — infer from the project (ask if genuinely unclear).
   - `docs.path: '../docs'` in the classic preset's options — serves the
     real `docs/` folder, not a copy.
   - `blog: false` in the same preset options.
   - **`markdown: { format: 'md' }` at the top level of the config, sibling
     to `presets`/`themeConfig` — not optional.** Docusaurus's default
     parser treats `.md` files as MDX, and MDX fails to compile the
     `<!-- autodocs:keep -->` HTML comments `generate-docs.mjs` writes (it
     parses `<!--` as JSX and errors). This is a real, verified bug, not a
     hypothetical — confirm by running a build before and after this line
     if you want to see it yourself.
5. **Fix `site/src/pages/index.js` — required, not optional, even with no
   tours yet.** The scaffolded homepage links to `/docs/intro`, a sample
   page that no longer exists once `docs.path` points at the real `docs/`
   (step 4) — the build fails on that broken link otherwise (verified: it
   does, with exactly this error). Link to one of the project's actual
   generated tour pages if any exist (e.g. `/docs/<some-tour-id>`); if none
   exist yet, remove the link/button entirely rather than pointing it
   anywhere.
6. `cd site && npm install && npm run build` — confirm it actually succeeds,
   don't just assume the edits were correct.
7. Report what was created and how to preview it (`cd site && npm start`),
   and point at this plugin's own README section "Deploying your docs" for
   publishing it somewhere.

## Steps

Runs against whichever tour(s) were resolved above (one slug, or every
`tours/*.yaml`). In `--review` mode, stop after Step 5's summary — the same
behavior as before autonomy existed. Otherwise (the default), continue into
Step 6 and ship a PR.

1. **Capture.** For each target tour, run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/capture.mjs" --tour <slug>
   ```
   If this fails because a `storageStatePath` auth profile hasn't recorded a
   session yet, the error already names the exact `save-auth-state.mjs`
   command to run — **resolve `${CLAUDE_PLUGIN_DATA}` to its real path
   before relaying that command**, so the user can copy it straight into
   their own terminal (it opens a real, visible browser window — this has to
   run somewhere with a display, not from this Bash tool). This is a hard
   stop (see "Autonomy" above): report it and wait, don't attempt to work
   around it. Mention the `--wait-for "<url-pattern>"` flag if they'd rather
   it detect completion automatically than wait for them to press Enter.

2. **Check drift.** Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/drift.mjs"
   ```
   to see which tours are dirty, clean, or draft/proposed (skipped
   entirely). Only dirty tours need regeneration — this is the whole point
   of the gate: don't waste a subagent call or rewrite a page that hasn't
   actually changed.

3. **Generate prose for dirty tours.** For each tour the drift check reports
   as dirty, invoke the `doc-scribe` subagent with that tour's file slug as
   its task input. Wait for it to write
   `.autodocs/artifacts/prose/<tour-id>.json` before continuing — do not
   write any prose yourself, that's the subagent's job, done in an isolated
   context so it doesn't pollute this session.

4. **Assemble.** For each dirty tour, once its prose file exists, run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/generate-docs.mjs" --tour <slug>
   ```
   This reads the prose the subagent wrote, applies the pixel-diff gate to
   screenshots, preserves any human-edited `<!-- autodocs:keep -->` regions,
   and advances that tour's entry in `.autodocs/artifacts/state.json`. A
   hash-mismatch refusal here (a human edited a page outside its
   `autodocs:keep` region) is a hard stop — never `--force` past it.

5. **Summarize.** Report, for this run:
   - which tours were regenerated (and a one-line reason: code changed
     under their `code_paths`, or their screenshots changed)
   - which tours were skipped as clean, and which were skipped as draft
   - anything that failed and why

   This summary is meant to double as the body of the docs PR — keep it
   short and factual, no filler.

6. **Ship.** Skipped entirely if nothing was regenerated in step 4 (nothing
   to commit), or if this run stopped at a hard stop above. Otherwise:
   1. Run `git rev-parse --abbrev-ref HEAD`. If the current branch matches
      `feat/*` or `fix/*`, commit onto it directly — docs follow the feature
      they document, landing in the same PR as the code. If it's
      `main`/`master` (or anything else that isn't a feature/fix branch),
      create and switch to a new `docs/<slug>` branch first (or a name
      summarizing the run, for a no-slug or `map` run) — never commit
      generated docs directly to `main`/`master`.
   2. Run `node "${CLAUDE_PLUGIN_DATA}/scripts/review-diffs.mjs"` and keep
      its report — it's the only place a screenshot change is visible
      before it's pushed, and it becomes part of the commit/PR body.
   3. Stage only this run's pipeline outputs — `docs/*.md`, `docs/images/**`,
      and any `tours/*.yaml` this run wrote or confirmed. Never stage
      `.autodocs/artifacts/` (gitignored; it's local working state, not a
      deliverable) or anything else in the working tree unrelated to this
      run.
   4. Commit (message: which tour(s) changed and why — code or
      screenshots), then push. If the branch has no open PR yet, `gh pr
      create` against `main` with the step 5 summary plus the review-diffs
      report as the body; if one already exists for this branch, the push
      alone updates it — don't open a second PR.
   5. **Never merge the PR.** Opening or updating it is the end of this
      skill's job — merging into `main` stays the human's explicit call,
      same as the brief's own "never auto-merge generated docs" principle.

Never hand-write or hand-edit anything under `docs/` yourself in this
skill — every page in `docs/` is either subagent-authored prose assembled by
`generate-docs.mjs`, or a human edit inside a `<!-- autodocs:keep -->`
region. If a step above fails, stop and report it rather than working around
it. If a script fails with a missing-dependency or missing-browser error,
the `SessionStart` hook that installs them may not have finished yet or may
have failed — check `${CLAUDE_PLUGIN_DATA}/package.json` exists and suggest
restarting the session before troubleshooting further.
