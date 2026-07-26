---
name: document
description: Captures tours, regenerates whichever docs changed via the doc-scribe subagent, and ships a docs PR — autonomous by default (the PR is the review point, never auto-merged). "propose <slug> \"<description>\"" drafts a new tour for a feature you just built, via the tour-scout subagent. "map" discovers every feature of the app automatically (authenticated crawl + code review), drafts tours for every gap, and archives tours whose feature no longer exists. "prune" runs just that archival check on its own, no crawl required. "product" (re)generates the product-level overview/getting-started/concepts pages via the product-scribe subagent, grounded in README/package.json/the tour inventory — never the browser. "validate" preflight-checks config/tours/product pages with no browser. "status" reports which tours/product pages are dirty, clean, or gated, and when each was last generated — read-only, no browser. "init-site" scaffolds a Docusaurus site for docs/ (or re-applies styling if one already exists). Append "--review" to any mode to stop-and-ask instead of running autonomously, or "--no-style" to skip design-skill detection. Bootstraps itself on first run in any project.
argument-hint: "[tour-id] | propose <slug> \"<description>\" | map [--interactive] | prune | product | validate | status | init-site   (any mode: [--review] [--no-style])"
allowed-tools: Bash(git *) Bash(gh pr *) Bash(node *) Edit Read Write Skill
---

Arguments: $ARGUMENTS

All commands below run against `${CLAUDE_PROJECT_DIR}` (the project you're
in) using the AutoDocs engine bundled with this plugin, copied to
`${CLAUDE_PLUGIN_DATA}/scripts/` on session start (see `hooks/hooks.json`) —
run every script as `node "${CLAUDE_PLUGIN_DATA}/scripts/<name>.mjs" ...`,
never `npm run ...`; the project you're documenting has no reason to have
AutoDocs' own npm scripts.

## Autonomy

By default, every mode below (the normal pipeline, `propose`, `map`, `prune`,
and `product`) runs end-to-end to an opened docs PR without stopping for
review at each intermediate step — that single PR (never auto-merged) is the
review point.
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
- `generate-docs.mjs` (or `generate-product-docs.mjs`, for a product page)
  refuses because a page was hand-edited outside a `<!-- autodocs:keep -->`
  region (hash mismatch) — never `--force` past this; a human needs to look.
- `verify-docs.mjs` (Step 6 Ship's first sub-step) reports an **`error`**
  finding — a broken image reference or a dead internal link/anchor
  somewhere under `docs/`, not necessarily on a page this run touched. Never
  push docs with a known-broken reference; `warn` findings (e.g. an orphan
  image) don't block.
- `map --interactive` still requires the out-loud dev-environment
  confirmation in its own preflight step before crawling with synthetic form
  submission — required in both autonomous and `--review` mode, never
  skipped.

**Not a hard stop:** `map`'s crawl skipping one auth profile whose session
isn't recorded yet (see "Map the whole app" steps 2/4). That's a per-profile,
non-blocking skip — the crawl maps everything reachable under every other
profile and reports the gap, rather than the whole run stalling on one
missing role's session the way a *tour's own* `capture.mjs` run does above.

**Also not a hard stop:** `product-scribe` reporting it couldn't ground one
of the requested product pages (e.g. no README to build a `concepts` page
from). That page is skipped and reported — every other product page and
every tour still generates and ships normally, unlike a tour's own
grounding failure above, which does stop that tour's dispatch.

**`--review`**, appended to the normal run, `propose`, or `map`, restores the
previous stop-and-ask-at-each-step behavior for anyone who wants to stay
hands-on: draft or capture, report, and wait — rather than auto-validating,
auto-confirming, generating, and shipping.

Whichever mode you're in, **never auto-merge** a docs PR into `main` —
opening (or updating) it is as far as autonomy goes; merging stays the
human's explicit call.

## Step 0 — first run in this project: bootstrap

If `${CLAUDE_PROJECT_DIR}/autodocs.config.yaml` doesn't exist yet, **or** it
exists but `${CLAUDE_PROJECT_DIR}/tours/` doesn't — a sign a previous
bootstrap was interrupted (crashed, killed) before it finished; every
artifact `init-project.mjs` writes is independently idempotent, so it's
always safe to resume this way — this project needs bootstrapping. Before
anything else:

1. If `autodocs.config.yaml` doesn't exist yet, ask the user for the app's
   local base URL (e.g. `http://localhost:3000`) — don't guess a port. If it
   already exists (the resume case above), skip straight to step 2 — the
   existing `baseUrl` is kept, not re-asked.
2. Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/init-project.mjs" [--base-url <url>]
   ```
   (omit `--base-url` on the resume case; it's only required when writing a
   fresh config, and is ignored otherwise). This writes a real, valid
   `autodocs.config.yaml` at the project root (live
   `baseUrl`/`viewports`/`outputDir`, plus every optional section — both
   `auth` shapes, `defaultMask`, `pixelDiffThreshold`, `seeds` — as
   commented-out examples right there in the file, so there's no dead
   pointer to chase down later) **only if it doesn't already exist** — it's
   never overwritten. It also creates whatever's missing among an empty
   `tours/` directory, a short `tours/README.md` "what's next" pointer, and
   — security-critical, don't skip or reimplement this by hand — merges
   `.autodocs/artifacts/` and `.env` into the project's `.gitignore`
   (idempotently; safe to re-run) so a live session-cookie file or
   scripted-login credentials can't get committed by accident, plus a
   `.env.example` if one doesn't already exist. Report whatever it reports —
   a fresh bootstrap, a resumed one that filled in what was missing, or
   nothing to do — and move on to the arguments below.
3. On a fresh bootstrap only (not the resume case — a resumed project may
   already have tours), tell the user plainly: there are no tours yet. The
   fastest way to get one is `/document propose <slug> "<description>"`
   after implementing a feature — by default this runs all the way through
   to an opened docs PR (see "Autonomy" above); append `--review` if you'd
   rather review the draft yourself before it's confirmed and shipped. Once
   at least one tour is `confirmed` and `/document` has generated its page,
   `/document init-site` scaffolds a browsable docs site for `docs/`. Then
   stop; there's nothing to capture/generate until a tour exists.

If both `autodocs.config.yaml` and `tours/` already exist, skip straight to
the arguments below.

Parse `--review` and `--no-style` out of the arguments wherever they appear
(both are flags, not positional) before matching what's left against the
modes below. `--review`'s presence puts this run in review mode (stop-and-
ask, matching every behavior before autonomy existed); its absence means
autonomous mode, the default described in "Autonomy" above. `--no-style`'s
presence skips **"Apply the project's design skill"** below entirely for
this run (the escape hatch for a project that deliberately wants plain,
unbranded docs — this repo is one, per its own `CLAUDE.md`). Both apply to
every mode below, not just the normal pipeline.

If the arguments start with `propose`, follow **"Propose a new tour"** below.
If the arguments start with `map`, follow **"Map the whole app"** below.
If the arguments are `prune`, follow **"Prune orphaned tours"** below.
If the arguments are `product`, follow **"Document the product itself"**
below.
If the arguments are `validate`, follow **"Validate a project"** below.
If the arguments are `status`, follow **"Report project status"** below.
If the arguments are `init-site`, follow **"Scaffold a docs site"** below —
this also covers re-applying styling to an already-scaffolded site, so
there's no separate "restyle" mode.
Otherwise: run the AutoDocs pipeline — apply the project's design skill (once,
if not already applied and `--no-style` wasn't given) → capture → drift gate
→ dispatch dirty tours needing new prose to the `doc-scribe` subagent (plus
the product pages, if dirty, to `product-scribe` — see "Document the product
itself" below, folded into Steps 2–4) → regenerate → summarize → ship. If a
tour file slug was given, operate on just `tours/<slug>.yaml` (the product
pages are only touched by their own `product` mode or a no-argument run, never
by a single-tour run); with no argument, operate on every `*.yaml` file in
`tours/` plus the product pages.

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
combines an **authenticated** dynamic crawl of the running app — every
configured auth profile, plus one signed-out pass, so role-gated features
aren't invisible — with your own reading of its source code and a direct
visit of every route source declares, then proposes a feature list and a doc
structure — and, in the default autonomous mode, drafts and ships tours for
every discovered gap without asking which ones first (see "Autonomy" above
for the hard stops that still apply, per feature). Same "propose, then carry
through" discipline as **"Propose a new tour"** above, just applied across
many candidate features at once instead of one you were told about.

1. **Preflight.** Config must exist (Step 0 above bootstraps it if not). Note
   every profile under `autodocs.config.yaml`'s `auth` — each one gets its own
   crawl pass below, so a feature gated behind any configured role gets
   found, not just what an anonymous visitor can reach. If `--interactive`
   was requested, this crawl fills in and submits safe-looking forms with
   synthetic data on the real running app — **confirm out loud with the user
   that `baseUrl` points at a throwaway or dev environment, not anything with
   real data**, before proceeding (in both autonomous and `--review` mode —
   this confirmation is never skipped). `crawl.mjs` itself refuses to run
   interactively unless `crawl.allowInteractive: true` is also set in
   `autodocs.config.yaml` (see the README's "Mapping a whole app
   automatically") — if it reports that, that config flag still needs to be
   turned on deliberately; don't work around it by any other means.
2. **Discovery crawl.** Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/crawl.mjs" --all-auth [--interactive]
   ```
   Crawls once per configured auth profile plus one signed-out (anonymous)
   pass, merging every pass into one site map — each page tagged with which
   role(s) reached it (`reachedBy`). A profile whose session hasn't been
   recorded yet (`storageStatePath` not saved, or missing credentials) is
   skipped with a clear reason and doesn't abort the run — the report at the
   end calls out anything skipped so you know that role's features may be
   under-covered this run, without blocking discovery of everything else.
   Writes `.autodocs/artifacts/site-map.json`. This proves *reachability*; it
   doesn't replace reading the code (next step), since a route can exist
   without being linked from anywhere any configured profile can reach (e.g.
   gated behind a role nobody's configured, or only reachable via in-app
   JS/button navigation rather than a real `<a href>`).
3. **Code review.** Read the app's routing/pages source — adapt to whatever
   the project actually uses (React Router config, Next.js/SvelteKit
   file-based routing, a Vue Router table, etc.), there's no one bundled
   parser for this on purpose (framework conventions and versions drift;
   this is exactly the kind of judgment call you're better suited for than
   a brittle script — same reasoning as `init-site` below). Enumerate real
   features: each one's route, a short description, and its backing
   `code_paths`. Write every route found this way, site-relative
   (`/foo/bar`, not absolute), to `.autodocs/artifacts/source-routes.json` as
   a plain JSON array — the input for the confirmation crawl next.
4. **Confirmation crawl.** Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/crawl.mjs" --all-auth --routes-file .autodocs/artifacts/source-routes.json --max-depth 0
   ```
   Directly visits every route the code review just found, under every auth
   profile plus anonymous, instead of relying on the discovery crawl having
   linked to it — this is what actually gets "every feature", not just every
   *linked* one. `crawl.mjs` merges this into the same `site-map.json` (it
   reads/writes the same file the discovery crawl did, so run step 2 first).
   A route that redirects to a login/error page for a given profile is
   recorded landing there — a real signal that it's gated for that role, not
   silently missing. Reconcile the merged site map against the source
   feature list: a route reached (by either crawl, under any profile)
   confirms real UI is there; a route no pass ever reached under any profile
   gets flagged as possibly unreachable/misconfigured, not silently dropped
   or silently assumed real.
5. **Prune existing tours.** The reconciliation above finds features with no
   tour (gaps); this does the reverse — tours whose feature may no longer
   exist. Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/prune.mjs"
   ```
   It picks up the `site-map.json`/`source-routes.json` steps 2/4 just wrote
   automatically (no flags needed) and reports each confirmed/stable tour as
   `ok` or `orphan (<reasons>)` — `code-removed` (its `code_paths` used to
   resolve to real files and no longer does) and/or `route-unreachable`
   (none of its `goto` steps' paths appear in the crawl or the code review).
   Unlike gap-drafting below, there's no subagent judgment call here — both
   signals are mechanical string/glob checks against data this run already
   produced. But they're not equally strong: `code-removed` checks the
   committed git tree directly (exact), while `route-unreachable` checks
   against a crawl/code-review pass that's explicitly best-effort elsewhere
   in this same flow (bounded by `maxPages`/`maxDepth`, a profile can be
   skipped, and a `site-map.json` left on disk from an earlier, narrower run
   is just as easy to reconcile against as a fresh one) — treating a route
   the crawl didn't happen to reach as *proof* it's gone would risk archiving
   a live tour on nothing more than incomplete coverage. So: **autonomous
   mode archives only tours flagged `code-removed`** (`prune.mjs` marks these
   "safe to auto-archive"), one
   `node "${CLAUDE_PLUGIN_DATA}/scripts/archive-tour.mjs" --tour <id>` per
   such tour (see "Prune orphaned tours" below for what that does — it only
   ever archives, never deletes tour YAML or doc content). A tour flagged
   `route-unreachable` only is reported, not archived, in either mode —
   surface it in step 9's report so a human can look, same
   "flag-not-act-on-weak-evidence" posture as tour-scout's own "unconfirmed
   reachability" note for a gap feature no crawl pass reached. **`--review`
   mode lists every candidate (both confidence levels) and archives
   nothing this run** — ask-first posture, same as gap drafting below.
6. **Write the doc plan.** Write `.autodocs/artifacts/doc-plan.md`: the
   reconciled feature list — slug (run each through the same
   lowercase-kebab-case rule `tours.mjs`'s `assertSafeSlug` enforces),
   route, one-line description, `code_paths`, which role(s) (`reachedBy`)
   actually reached it or "unreached by any profile" if none did, and
   whether an existing `tours/*.yaml` already covers it — grouped into a
   suggested doc structure (an ordered list of sections, e.g. Getting
   Started → core features → settings/admin). Also note anything step 5
   flagged/archived, so the plan doubles as the audit trail for both
   directions (gaps drafted, orphans archived) this run touched.
7. **Autonomous mode: draft every gap feature.** For each feature in the doc
   plan not already covered by an existing tour, dispatch the `tour-scout`
   subagent exactly as in "Propose a new tour" step 4 (slug, description,
   candidate `code_paths`, existing tour/fixture filenames), additionally
   passing that route's affordances from `site-map.json` **and which auth
   profile (if any) reached it** as hints — tour-scout still verifies
   everything live via Playwright MCP itself, signing in as that role via the
   existing `preconditions.auth` mechanism when one applies; the site map
   only points at where to look first and as whom. A feature no crawl pass
   reached under any profile still gets drafted (tour-scout verifies live),
   but flagged in the report as unconfirmed reachability. One dispatch per
   feature. Every draft lands `status: proposed`, same as `propose`. Then,
   per drafted tour, apply "Propose a new tour" steps 5–6 (hard-stop check,
   then validate → auto-confirm → Steps 1–5 capture/generate) — but skip that
   tour's own Step 6 Ship; a hard stop on one feature doesn't stop the
   others, just note it and move on. Shipping for every feature drafted this
   run happens once, together, in step 8 below.

   **`--review` mode: present and ask instead.** Show the user the
   discovered feature list (already covered vs. gaps, with reachability per
   role) and the proposed structure. Ask which gap features to draft tours
   for now — don't draft all of them; for each one picked, dispatch
   `tour-scout` the same way, but stop after the draft (the review path in
   "Propose a new tour" step 6) rather than auto-confirming.
8. **Ship.** Autonomous mode only, once every feature's dispatch this run has
   completed Steps 1–5 (and step 5's archiving, if any orphans were found):
   run **Step 6 (Ship)** under "Steps" below a single time, covering every
   tour confirmed/generated and every tour archived this run together — one
   commit, one PR, rather than one per tour.
9. **Report.** What was discovered, the coverage manifest (which role reached
   which feature, and anything no profile reached), which auth profiles were
   skipped and why, what's already covered, the proposed structure, what was
   drafted this run (and tour-scout's own uncertainties for each), which ones
   hit a hard stop and why, which existing tours were flagged/archived as
   orphans (or, in `--review` mode, just flagged), and — in autonomous mode —
   the branch/PR that was shipped, or — in `--review` mode — the reminder to
   review, flip `status: confirmed`, then `/document validate` and the normal
   pipeline.

## Prune orphaned tours

Parses as `prune [--review]`. This is "Map the whole app" step 5 on its own,
for when you just want the archival check without a full crawl/code-review
pass — useful as a periodic check, or right after removing a feature
yourself. No browser is launched unless a previous `/document map` run left
`site-map.json`/`source-routes.json` behind (see below).

1. Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/prune.mjs"
   ```
   Checks every confirmed/stable tour's `code_paths` still resolves to real
   files (the `code-removed` signal — works standalone, no crawl needed). If
   `.autodocs/artifacts/site-map.json` and/or `source-routes.json` already
   exist from an earlier `/document map` run, it also checks each tour's
   `goto` step paths against them (`route-unreachable`) — it never crawls or
   reads source itself; run `/document map` first if you want that fuller
   check and don't have a recent one on disk. Reports each tour `ok`,
   `orphan (...) — safe to auto-archive` (`code-removed`: checked against the
   committed git tree, exact), or `orphan (...) — needs human review`
   (`route-unreachable` only: checked against a crawl/code-review pass that's
   explicitly best-effort elsewhere in this same flow — bounded by
   `maxPages`/`maxDepth`, a profile can be skipped, and a `site-map.json`
   left on disk from an earlier, narrower run reconciles exactly the same as
   a fresh one — so an unreached route is a reason to look, not proof).
2. **No orphans found:** report that and stop — nothing to do.
3. **Autonomous mode (default):** for each orphan flagged `code-removed`
   (i.e. reported "safe to auto-archive"), run
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/archive-tour.mjs" --tour <id>
   ```
   same as "Map the whole app" step 5 — flips `status: archived`, moves
   `docs/<id>.md` (and its images) under `docs/archive/` with a banner, and
   writes `docs/archive/_category_.json` the first time (see the README's
   "Archiving a removed feature" for what a reader sees). Never deletes
   `tours/<id>.yaml` or any doc content — reversible by hand (flip `status`
   back to `confirmed`, move the page back) if the detection was wrong. A
   `route-unreachable`-only candidate is never auto-archived, in either
   mode — surface it in step 4's report instead. Then, if anything was
   archived, run **Step 6 (Ship)** under "Steps" below once, covering every
   tour archived this run.

   **`--review` mode:** list every orphan candidate (both confidence levels)
   and their reasons, and stop there — don't archive anything, don't ship.
   Tell the user to review and either run `/document prune` again without
   `--review` once satisfied, or archive individually with `archive-tour.mjs
   --tour <id>`.
4. Report what was found — which were auto-archived (autonomous mode), which
   need human review (`route-unreachable` only, either mode) — and, in
   autonomous mode, the branch/PR that shipped if anything did.

## Document the product itself

Parses as `product [--review]`. Tours and `doc-scribe` describe individual UI
flows; this generates the layer above them — up to six pages, `overview`,
`getting-started`, `concepts`, `configuration`, `troubleshooting`, `changelog`
(whichever are enabled — see `autodocs.config.yaml`'s `product.pages`,
default all six) — describing what the product **is**, grounded in the repo
itself (README, `package.json`, `.env.example`, `autodocs.config.yaml`,
`CHANGELOG.md` if present, any extra `product.sources` globs, and the
confirmed tour inventory), never the running app. This needs no browser and
no tours, so it's runnable immediately after Step 0's bootstrap — a
brand-new project can get a real landing page before its first tour exists.
The three newer pages degrade gracefully on a project that doesn't have
their grounding — no troubleshooting/FAQ section in the README, no
`CHANGELOG.md`/git tags, nothing configurable documented — `product-scribe`
just omits them, same as any other ungrounded page.

1. Run `node "${CLAUDE_PLUGIN_DATA}/scripts/drift.mjs"` (or just read its
   `_product` line if you already ran it this session) to see whether the
   product pages are dirty, and why: `(inputs)` means a grounding file or the
   tour inventory changed and needs fresh `product-scribe` prose;
   `(render only — no new prose needed)` means only the template/`docs:`
   layout/design-style changed, so the existing prose is still grounded and
   only needs re-assembling; clean means nothing to do.
2. **If dirty for `inputs` (or never generated):** first, **if `changelog` is
   enabled and the project has no `CHANGELOG.md`**, run
   `git tag --sort=-creatordate` yourself (you have `Bash(git *)`;
   `product-scribe` doesn't — it only ever gets a file list, never runs
   anything) and write the output, one tag per line, to
   `.autodocs/artifacts/git-tags.txt` — this is what lets the changelog page
   ground in a real version history instead of being silently omitted on a
   project with no changelog file. Skip this step entirely for any other
   page combination; it's changelog-specific.

   Then dispatch the `product-scribe` subagent with: which pages to generate
   (`product.pages`, default all six), the grounding file list
   (`collectProductSources` — README/package.json/.env.example/
   autodocs.config.yaml/CHANGELOG.md plus any `product.sources` globs,
   already filtered to exclude `.env`/key files/`.auth/` — plus
   `.autodocs/artifacts/git-tags.txt` too, if you just wrote it), and the
   confirmed tour inventory (id/title/intent). Wait for it to write
   `.autodocs/artifacts/prose/_product.json` — don't write this prose
   yourself, same "never invent" discipline as `doc-scribe`. If dirty only
   for `render`, skip this dispatch — the existing prose file is reused
   as-is.
3. Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/generate-product-docs.mjs"
   ```
   Assembles whichever pages `product-scribe` actually grounded (a page it
   couldn't ground is skipped and reported, not padded with invented
   content — this is **not** a hard stop, unlike a tour's own generation
   failure; the other pages and every tour still ship), applies the current
   `docs:`/design-style layout and frontmatter, preserves any human-edited
   `<!-- autodocs:keep -->` regions, and writes
   `docs/_sidebar.autodocs.json` (the ordered page/section structure
   `init-site` wires the scaffolded site's sidebar to, if one exists). A
   hash-mismatch refusal here (a human edited a page outside its keep-region)
   is a hard stop, same as a tour's — never `--force` past it in this mode.
4. **In `--review` mode:** stop here and report what was (re)generated, what
   was skipped for lack of grounding, and anything that needs a look — don't
   ship.
   **Otherwise (default):** run **Step 6 (Ship)** under "Steps" below,
   covering the product pages generated this run.
5. Report what was generated/skipped and, in autonomous mode, the branch/PR
   that shipped.

This same dirty-check → dispatch → generate sequence is also folded into the
normal (no-argument) pipeline's Steps 2–4 below — a plain `/document` run
keeps the product pages in sync automatically, the same way it does for
tours, without needing a separate `/document product` invocation every time.

## Validate a project

Preflight-checks `autodocs.config.yaml`, every tour under `tours/`, and the
product pages, without launching a browser — catches problems that would
otherwise only surface mid-run (an undefined `preconditions.auth` profile
fails partway through `capture.mjs`, after it's already launched a browser).
Run:

```
node "${CLAUDE_PLUGIN_DATA}/scripts/validate.mjs"
```

It reports, per tour: `ok`, or a list of `error`/`warn` findings — an
undefined `preconditions.auth` profile or a `prerequisites`/`see_also` entry
naming a tour that doesn't exist under `tours/` are **errors** (capture
would fail, or generation would render a dead link), while an empty
`code_paths` glob match, a not-yet-recorded `storageStatePath` session, a
non-`role=`/`text=` interactive selector, or a cross-link naming a tour that
exists but isn't published yet (draft/proposed/archived) are **warnings**
(things still run, just not as intended). It also reports one
`_product` line — always `warn`, never `error`, since a thin grounding source
means the generated pages will be thin, not that generation will fail: no
`README.md`, a `product.sources` glob matching nothing, a `docs.sections`
entry naming a tour that doesn't exist, or a confirmed tour in no
`docs.sections` group. Report the output plainly; don't silently fix a tour
or the config yourself — a human authored or confirmed it. Recommend running
this after authoring/confirming a tour (or editing `product`/`docs.sections`
config) and before the normal pipeline, especially right after `propose`
drafts one.

## Report project status

Read-only — no browser, no subagent, no PR. Answers "which tours/product
pages are stale, which have no page yet, and when was each last generated"
cheaply, without the cost of `map`'s full authenticated crawl. Run:

```
node "${CLAUDE_PLUGIN_DATA}/scripts/status.mjs"
```

For each tour it reports `dirty`/`clean` (with the same reason annotations
`drift.mjs` uses — `(screenshots, code)` vs. `(render only — no new prose
needed)`), or its gate if it's skipped (`draft`, `proposed`, `archived`, or
`?` for never-captured), plus when it was last generated: a date and short
commit SHA (from `state.json`'s `generatedAt`/`generatedAtCommit` — written by
`generate-docs.mjs`/`generate-product-docs.mjs` every time a page actually
regenerates, never on a clean run with nothing to do), or "generated at an
unknown time" for a page that predates this field. Product pages report the
same way, per page. Ends with totals and any **anomalies**: a confirmed,
stable tour with no generated page yet, or a `docs/*.md` file matching no
real tour id or enabled product page id (most likely a hand-created page, or
a leftover from a tour that was renamed/deleted without going through
`archive-tour.mjs` — see "Archiving a removed feature"/`archive-tour.mjs`).

This never changes what a real `/document` run would do — report it plainly
and stop; don't act on a `dirty` tour or an anomaly yourself here.

`autodocs.config.yaml`'s `docs.stampVerified: true` (opt-in, default off)
additionally stamps each generated page's frontmatter with `last_verified:
"<date> (<short-sha>)"` — the same values this report reads out of
`state.json`, now visible on the page itself. Flipping it re-renders every
existing page once through the normal drift path (it flows into the shared
render hash via `docsConfig`, like any other `docs:` setting) — no template
version bump, no separate migration step needed.

## Scaffold a docs site

`init-site` sets up a [Docusaurus](https://docusaurus.io/) site in this
project that serves its `docs/` folder directly — no separate content
duplication. This is prompt-driven rather than a bundled script on purpose:
scaffolding tool versions and templates drift, and adapting to that is
exactly the kind of thing you're better suited for than a brittle script.
Follow the exact recipe below — it's proven, not a guess (this plugin's own
repo runs it):

1. **If `${CLAUDE_PROJECT_DIR}/site/` already exists, this is a restyle run,
   not a fresh scaffold** — nothing here is destructive, so running
   `init-site` again is always safe, and it's also how you pick up a
   newly-installed or changed design skill, or apply one that `--no-style`
   skipped originally, or backfill search on a site scaffolded before that
   existed: just run `init-site` again.
   - **Backfill search first, unconditionally (not gated by `--no-style` —
     search is a capability, not a style choice).** Check whether
     `site/package.json`'s dependencies already include
     `@easyops-cn/docusaurus-search-local`; if not, apply step 5 below
     (install + config) to this existing site now.
   - **Backfill the sidebar wiring too, unconditionally — same reasoning.**
     If `docs/_sidebar.autodocs.json` exists but `site/sidebars.js` still
     uses the default `{type: 'autogenerated', ...}` array (no reference to
     that file), apply step 6 below to this existing site now.
   - **Backfill the homepage link too, unconditionally — same reasoning
     again.** If `site/src/pages/index.js` still links anywhere other than
     `/docs/overview` and `docs/overview.md` now exists (the common case: the
     site was scaffolded before a product overview page existed, or before
     any tour did), apply step 7 below to this existing site now. Not a
     styling choice either — a homepage that still points at some other page
     once a real overview exists is a content-freshness gap, not a look.
   - Then, if `--no-style` was passed this time too: rebuild (`cd site &&
     npm run build`, `npm install` first only if step 5 just added the
     search dependency) if search, the sidebar wiring, and/or the homepage
     link were backfilled, otherwise there's nothing left to do. Report
     accordingly and stop.
   - Otherwise, re-run **"Apply the project's design skill"** below,
     ignoring its own "skip if `.autodocs/doc-style.json` already exists"
     shortcut so it actually re-detects and re-applies, then `cd site && npm
     install && npm run build` (`npm install` is a no-op if step 5 didn't
     just add a new dependency, so always safe to include) to confirm the
     refreshed theme (and any backfills) still builds. Report
     "site already existed — refreshed styling" (naming which skill, if any,
     or that none was applied) and/or "backfilled search"/"backfilled
     sidebar wiring"/"backfilled homepage link" as applicable, instead of
     scaffolding from scratch.

   Otherwise (no `site/` yet), continue with steps 2–9 below for a fresh
   scaffold.
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
5. **Add local search — required, not optional.** A generated-tutorials site
   is exactly the kind of thing that accumulates pages over time as
   `/document propose`/`map` draft more tours; without search, "browse the
   sidebar" stops being a real way to find anything past a handful of pages.
   Deliberately **not** Algolia DocSearch — that needs an external service
   and an application/approval step, which cuts against this plugin's
   install-once-no-external-accounts model.
   ```
   cd site && npm install @easyops-cn/docusaurus-search-local
   ```
   Then add a `themes` array as a new top-level key in
   `site/docusaurus.config.js` (sibling to `presets`/`themeConfig`):
   ```js
   themes: [
     [
       '@easyops-cn/docusaurus-search-local',
       {
         hashed: true,
         indexDocs: true,
         indexBlog: false,
       },
     ],
   ],
   ```
   Leave `docsRouteBasePath` unset — it must match the docs plugin's own
   route base path, which this config never overrides (Docusaurus's default
   is `/docs`); setting it to `/` here is a real mistake that silently
   breaks search-result links, not a hypothetical (caught by actually
   building and checking `build/search-index.json`'s entries had `/docs/...`
   URLs, not `/...`). Indexes at build time into `site/build/search-index.json`
   — confirm it actually worked by checking that file exists after step 9's
   build and contains an entry per generated tour page, same "verify by
   running it" discipline as the other fixes in this recipe. This also
   indexes anything under `docs/archive/` automatically — it's just more
   docs-plugin content, no separate config needed.
6. **Wire the generated sidebar structure, if one exists.**
   `generate-product-docs.mjs` writes `docs/_sidebar.autodocs.json` — a
   plain, framework-neutral `{productPages, sections, unsectionedTours}`
   payload — the first time at least one product page has been generated
   (see "Document the product itself"). If that file doesn't exist yet (a
   fresh project with no product/tour docs generated at all), leave
   `site/sidebars.js` on its scaffolded default
   (`{type: 'autogenerated', dirName: '.'}`) — there's nothing to build a
   real sidebar from yet, and re-running `init-site` later, once docs exist,
   picks this up on its own. If it does exist, replace `sidebars.js`'s
   default export with one that reads it (`fs.readFileSync` + `JSON.parse` —
   the file is plain JSON, and `sidebars.js` itself is ESM here, so
   `require` doesn't apply) and builds an explicit array: `productPages`'
   ids first, in the JSON's own order (they're already position-sorted),
   then one `{type: 'category', label, items}` block per `sections` entry,
   then `unsectionedTours`' ids appended flat at the end (still findable,
   just not grouped). **If `docs/archive/` exists, append one more entry —
   `{type: 'category', label: 'Archive', items: [{type: 'autogenerated',
   dirName: 'archive'}]}`.** This is required, not optional, the moment this
   step actually fires: Docusaurus's default `{type: 'autogenerated',
   dirName: '.'}` sidebar recurses into every subfolder automatically,
   including `docs/archive/` — which is the *only* reason "Archiving a
   removed feature" can promise every archived tutorial gets filed into a
   dedicated Archive section with zero sidebar config of its own. The moment
   this step replaces that default with an explicit array, that automatic
   recursion stops; without this entry, every archived page keeps building
   and stays reachable by direct URL/search, but silently drops out of the
   sidebar navigation entirely. Skip the entry only when `docs/archive/`
   doesn't exist yet (an autogenerated entry pointing at a directory with no
   docs in it fails the build) — check for it fresh each time this step
   runs, not just once, since a tour can be archived on a later run after
   the sidebar was already wired. Read the file at build time (top of
   `sidebars.js`, before the `export default`), not once and cached, so a
   later regeneration is picked up on the site's next build with no further
   edit needed here.
7. **Fix `site/src/pages/index.js` — required, not optional, even with no
   tours yet.** The scaffolded homepage links to `/docs/intro`, a sample
   page that no longer exists once `docs.path` points at the real `docs/`
   (step 4) — the build fails on that broken link otherwise (verified: it
   does, with exactly this error). Link to `/docs/overview` if
   `docs/overview.md` exists (the product overview page — see "Document the
   product itself" — is the right front door once it exists); otherwise to
   one of the project's actual generated tour pages if any exist (e.g.
   `/docs/<some-tour-id>`); if neither exists yet, remove the link/button
   entirely rather than pointing it anywhere.
8. Unless `--no-style` was passed, run **"Apply the project's design
   skill"** below now, before installing — it edits
   `site/src/css/custom.css`/`site/docusaurus.config.js`'s `themeConfig`,
   which the build in the next step should already reflect.
9. `cd site && npm install && npm run build` — confirm it actually succeeds,
   don't just assume the edits were correct (this also verifies the theming
   from step 8, the search setup from step 5, and the sidebar wiring from
   step 6 didn't break the build).
10. Report what was created and how to preview it (`cd site && npm start`),
    and point at this plugin's own README section "Publishing a docs site"
    for publishing it somewhere. Note which design skill (if any) was
    applied, that search is set up, and whether the sidebar is wired to
    `docs/_sidebar.autodocs.json` yet or still on the scaffolded default.

## Apply the project's design skill

Presentation only — see `CLAUDE.md`'s "Scope guardrail": this only ever
changes how generated docs *look* (the Docusaurus theme; page-layout knobs
like heading text, per-viewport summary labels, and whether a screenshot is
wrapped in a `<figure>`), never what `doc-scribe` writes or which UI a tour
describes, and it never injects a tagline or marketing copy into a generated
page. Runs once per invocation of the normal pipeline/`propose`/`map`,
immediately before Step 1 (Capture) under "Steps" below — skip it entirely
if `--no-style` was passed, or if `.autodocs/doc-style.json` already exists
(nothing to redo; re-running `init-site` above is the explicit way to redo
it, e.g. after installing or changing a design skill).

1. Run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/design-scan.mjs"
   ```
   Prints ranked design/brand-skill candidates found under this project's
   `.claude/skills/`/`.claude/plugins/` and the current user's own
   `~/.claude/` equivalents (`plugin/scripts/lib/design.mjs`'s
   `discoverDesignSkills`) — project-scoped candidates always outrank
   user-scoped ones. It deliberately never reads a parent directory's
   `CLAUDE.md`, so a project that opts out of an ambient parent brand (like
   this repo's own `CLAUDE.md` does) stays opted out.
2. **No candidates:** report that no design skill was found and proceed
   without styling — the common case, not an error.
3. **One or more candidates:** invoke the top-ranked one with the `Skill`
   tool. Read what it returns: color palette, fonts, logo/favicon asset
   paths, and any layout guidance it states. If more than one candidate was
   found, name which one was chosen and why in the run's final report.
4. Distill what the skill actually returned — never invent a value it
   didn't specify — into:
   - `Write` `.autodocs/doc-style.json` (committed, not gitignored —
     generated docs depend on it):
     `{ "skill": "<name>", "page": { ... } }`. The `page` object may set
     `stepsHeading`, `viewportLabels` (per-viewport summary text for the
     collapsed blocks non-primary viewports render into — see
     `autodocs.config.yaml`'s `docs:` section for which viewport stays
     primary), and `figures` (wraps each screenshot in
     `<figure class="autodocs-figure">` for the theme to style — leave this
     `false` unless the skill's own guidance calls for a captioned/framed
     screenshot treatment). Every value here passes through
     `lib/design.mjs`'s `loadDocStyle` validation (plain single-line labels,
     no markup) — keep well within those bounds; it isn't there to fight
     against.
   - If `site/` exists (see "Scaffold a docs site"), `Edit` its theme:
     `site/src/css/custom.css` (Infima's `--ifm-color-primary` ramp and
     fonts) and `site/docusaurus.config.js`'s `themeConfig` (logo — use the
     skill's own light/dark-safe asset, never recreate one — and favicon),
     plus CSS rules for the `.autodocs-viewport`/`.autodocs-figure` classes
     `lib/docgen.mjs` emits (style the `<summary>` and the collapsed block;
     don't fight `<details>`'s native disclosure behavior).
5. Report which skill (if any) was applied. A generated page itself only
   picks up a layout/style change (e.g. a new `stepsHeading`) the next time
   `/document` runs against it — the render hash in
   `.autodocs/artifacts/state.json` makes that automatic, no `--force`
   needed (see "Check drift" under "Steps" below).

## Steps

Runs against whichever tour(s) were resolved above (one slug, or every
`tours/*.yaml` plus the product pages, on a no-slug run — see Steps 2–4's
call-outs below). Unless `--no-style` was passed or
`.autodocs/doc-style.json` already exists, run **"Apply the project's design
skill"** above first. In `--review` mode, stop after Step 5's summary — the
same behavior as before autonomy existed. Otherwise (the default), continue
into Step 6 and ship a PR.

Unless this run is in `--review` mode (Step 6 Ship never runs this
invocation, so there's nothing to preflight), run `gh auth status` once,
now, before Step 1 below — not right before Step 6. `gh pr create` is the
very last thing a run does; checking this early means a missing or
unauthenticated `gh` is caught before any capture/generate work runs,
instead of only surfacing after everything else already succeeded. On
failure, report the exact fix (`gh auth login`) and stop.

1. **Capture.** For each target tour, run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/capture.mjs" --tour <slug>
   ```
   one invocation per tour, exactly as above — not `capture.mjs`'s own
   `--all`/repeated-`--tour` bulk mode (see the README's "Everyday commands"
   for that). A single-tour invocation's failure names exactly which tour
   and step it came from, unambiguously, which is what the hard-stop relay
   immediately below depends on; a bulk multi-tour run isolates each tour's
   failure from its siblings (useful for a human running it directly) at the
   cost of that same precision, so it stays a manual/advanced option rather
   than how this skill drives capture itself.
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
   to see which tours are dirty, clean, or draft/proposed/archived (skipped
   entirely — an archived tour's page lives on under `docs/archive/` instead;
   see "Prune orphaned tours" above for how a tour gets there). A dirty tour
   is annotated with why: `(screenshots, code)`
   means its content changed, while `(render only — no new prose needed)`
   means only the template/`docs:` layout/design-style changed (see
   `lib/design.mjs`'s render hash) — its existing prose is still grounded.
   Only dirty tours need regeneration at all — this is the whole point of
   the gate: don't waste a subagent call or rewrite a page that hasn't
   actually changed. **On a no-slug (whole-project) run only** — never for a
   single `--tour <slug>` run — also read the report's `_product` line the
   same way (see "Document the product itself" above for what its
   `(inputs)`/`(render only)` annotations mean).

3. **Generate prose for dirty tours that need it.** For each tour the drift
   check reports dirty for `screenshots` and/or `code` (not the render-only
   ones), invoke the `doc-scribe` subagent with that tour's file slug as its
   task input. Wait for it to write
   `.autodocs/artifacts/prose/<tour-id>.json` before continuing — do not
   write any prose yourself, that's the subagent's job, done in an isolated
   context so it doesn't pollute this session. A render-only dirty tour
   skips this step entirely — `generate-docs.mjs` (next step) reuses its
   existing prose file as-is. **On a no-slug run, if `_product` was dirty for
   `inputs`** (not render-only), also dispatch the `product-scribe` subagent
   exactly as "Document the product itself" step 2 describes.

4. **Assemble.** For every dirty tour (render-only ones included — their
   prose file already exists from a previous run), run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/generate-docs.mjs" --tour <slug>
   ```
   This reads whatever prose exists (freshly written by doc-scribe, or
   reused as-is for a render-only tour), applies the pixel-diff gate to
   screenshots, applies the current `docs:`/design-style layout, preserves
   any human-edited `<!-- autodocs:keep -->` regions, and advances that
   tour's entry (including its render hash) in
   `.autodocs/artifacts/state.json`. A hash-mismatch refusal here (a human
   edited a page outside its `autodocs:keep` region) is a hard stop — never
   `--force` past it. **On a no-slug run, if `_product` was dirty at all**,
   also run
   `node "${CLAUDE_PLUGIN_DATA}/scripts/generate-product-docs.mjs"` (no
   `--tour` flag — it always covers every enabled product page in one call).
   Same hash-mismatch hard stop applies per page.

5. **Summarize.** Report, for this run:
   - which tours were regenerated (and a one-line reason: code changed
     under their `code_paths`, their screenshots changed, or only the
     render/style layout changed)
   - which tours were skipped as clean, and which were skipped as
     draft/proposed/archived
   - on a no-slug run: whether the product pages were regenerated (and why),
     skipped as clean, or skipped for lack of grounding
   - anything that failed and why

   This summary is meant to double as the body of the docs PR — keep it
   short and factual, no filler.

6. **Ship.** Skipped entirely if nothing was regenerated in step 4 (nothing
   to commit), or if this run stopped at a hard stop above. Otherwise:
   1. Run `node "${CLAUDE_PLUGIN_DATA}/scripts/verify-docs.mjs"` — checks
      every image reference and internal link across the *whole* `docs/`
      tree resolves, not just this run's own pages (a rename or archive can
      break a link on a page this run didn't touch). An `error` finding is a
      hard stop (see "Autonomy" above): report it and stop before staging or
      committing anything — never push docs that reference a screenshot or
      page that isn't there. `warn` findings (e.g. an orphan image under
      `docs/images/`) don't block; fold them into the step 5 summary.
   2. Run `git rev-parse --abbrev-ref HEAD`. If the current branch matches
      `feat/*` or `fix/*`, commit onto it directly — docs follow the feature
      they document, landing in the same PR as the code. If it's
      `main`/`master` (or anything else that isn't a feature/fix branch),
      create and switch to a new `docs/<slug>` branch first (or a name
      summarizing the run, for a no-slug or `map` run) — never commit
      generated docs directly to `main`/`master`.
   3. Run `node "${CLAUDE_PLUGIN_DATA}/scripts/review-diffs.mjs"` and keep
      its report — it's the only place a screenshot change is visible
      before it's pushed, and it becomes part of the commit/PR body.
   4. Stage only this run's pipeline outputs — `docs/*.md`, `docs/images/**`,
      `docs/archive/**` (any tour this run archived — see "Prune orphaned
      tours"/"Map the whole app" step 5), `docs/_sidebar.autodocs.json` (only
      if this run wrote or changed it — see "Document the product itself"),
      any `tours/*.yaml` this run wrote, confirmed, or archived, and — only
      if this run applied or changed one — `.autodocs/doc-style.json`
      (committed, not gitignored) plus any
      `site/src/css/custom.css`/`site/docusaurus.config.js` theming edits.
      Never stage `.autodocs/artifacts/` (gitignored; it's local working
      state, not a deliverable) or anything else in the working tree
      unrelated to this run.
   5. Commit (message: which tour(s) changed and why — code, screenshots, or
      archived), then push. If the branch has no open PR yet, `gh pr
      create` against `main` with the step 5 summary plus the review-diffs
      report as the body; if one already exists for this branch, the push
      alone updates it — don't open a second PR.
   6. **Never merge the PR.** Opening or updating it is the end of this
      skill's job — merging into `main` stays the human's explicit call,
      same as the brief's own "never auto-merge generated docs" principle.

Never hand-write or hand-edit anything under `docs/` yourself in this
skill — every page in `docs/` is either subagent-authored prose assembled by
`generate-docs.mjs`, a human edit inside a `<!-- autodocs:keep -->` region,
or (only under `docs/archive/`) `archive-tour.mjs`'s own banner prepended at
archive time. If a step above fails, stop and report it rather than working around
it. If a script fails with a missing-dependency or missing-browser error,
the `SessionStart` hook that installs them may not have finished yet or may
have failed — check `${CLAUDE_PLUGIN_DATA}/package.json` exists and suggest
restarting the session before troubleshooting further.
