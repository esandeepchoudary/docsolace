---
name: document
description: Captures the current project's tours and regenerates docs for whichever tours actually changed, via the doc-scribe subagent. Invoke with a tour's file slug to limit the run to one tour (e.g. "/document dashboard"); with no argument, runs across every tour in tours/*.yaml. Invoke as "/document propose <slug> \"<description>\"" to draft a new candidate tour for a feature you just implemented, instead of running the normal pipeline. Works in any project — it bootstraps autodocs.config.yaml and tours/ the first time it's run there.
argument-hint: "[tour-id] | propose <slug> \"<description>\""
allowed-tools: Bash(git diff *) Bash(git log *)
---

Arguments: $ARGUMENTS

All commands below run against `${CLAUDE_PROJECT_DIR}` (the project you're
in) using the AutoDocs engine bundled with this plugin, copied to
`${CLAUDE_PLUGIN_DATA}/scripts/` on session start (see `hooks/hooks.json`) —
run every script as `node "${CLAUDE_PLUGIN_DATA}/scripts/<name>.mjs" ...`,
never `npm run ...`; the project you're documenting has no reason to have
AutoDocs' own npm scripts.

## Step 0 — first run in this project: bootstrap

If `${CLAUDE_PROJECT_DIR}/autodocs.config.yaml` doesn't exist yet, this is
the first time `/document` has run here. Before anything else:

1. Ask the user for the app's local base URL (e.g. `http://localhost:3000`)
   — don't guess a port.
2. Write a minimal `autodocs.config.yaml` at the project root: that
   `baseUrl`, a `viewports` map with one `desktop` entry (`1280x800`), and
   `outputDir: .autodocs/artifacts`. Point them at this plugin's own
   `autodocs.config.yaml` (in the AutoDocs repo, or `${CLAUDE_PLUGIN_ROOT}`'s
   reference copy if bundled) as an annotated example for adding
   `auth`/`defaultMask`/`pixelDiffThreshold` later — don't invent those
   values now.
3. Create an empty `tours/` directory.
4. Tell the user plainly: there are no tours yet. The fastest way to get one
   is `/document propose <slug> "<description>"` after implementing a
   feature — see Phase 7 in this plugin's design. Then stop; there's nothing
   to capture/generate until a tour exists.

If `autodocs.config.yaml` already exists, skip straight to the arguments
below.

If the arguments start with `propose`, follow **"Propose a new tour"** below
instead of the normal pipeline. Otherwise: run the AutoDocs pipeline —
capture → drift gate → dispatch dirty tours to the `doc-scribe` subagent →
regenerate → summarize. If a tour file slug was given, operate on just
`tours/<slug>.yaml`; with no argument, operate on every `*.yaml` file in
`tours/`.

## Propose a new tour

Parses as `propose <slug> "<description>"` — e.g.
`/document propose dashboard-export "the new Export CSV button on the dashboard"`.
This is the Phase 7 "assisted tour discovery" entry point (see the brief and
CLAUDE.md's "Tutorial-need check"): drafts a candidate tour, never a
confirmed one.

1. Confirm `tours/<slug>.yaml` doesn't already exist — if it does, stop and
   ask rather than overwrite it.
2. Compute candidate `code_paths`: `git diff --name-only` against the base
   branch (or recent commits if already merged) for files that plausibly
   back this feature — frontend source under the app's directory, not
   config/test/build files.
3. Invoke the `tour-scout` subagent with: the slug, the description verbatim,
   the candidate `code_paths` list, and the app's `baseUrl` (from
   `autodocs.config.yaml`). Wait for it to write `tours/<slug>.yaml` — don't
   draft the tour yourself, that exploration is tour-scout's job, grounded in
   what it actually finds by driving the app.
4. Report what was drafted, and tour-scout's own notes on what it's unsure
   about. Tell the user plainly: review the steps/selectors, fill in
   `preconditions`/`mask` if needed, then flip `status` to `confirmed` —
   nothing downstream (drift gate, `/document`'s normal pipeline) treats
   this tour as real until they do.

## Steps

1. **Capture.** For each target tour, run:
   ```
   node "${CLAUDE_PLUGIN_DATA}/scripts/capture.mjs" --tour <slug>
   ```

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
   and advances that tour's entry in `.autodocs/artifacts/state.json`.

5. **Summarize.** Report, for this run:
   - which tours were regenerated (and a one-line reason: code changed
     under their `code_paths`, or their screenshots changed)
   - which tours were skipped as clean, and which were skipped as draft
   - anything that failed and why

   This summary is meant to double as the body of the docs PR — keep it
   short and factual, no filler.

Never hand-write or hand-edit anything under `docs/` yourself in this
skill — every page in `docs/` is either subagent-authored prose assembled by
`generate-docs.mjs`, or a human edit inside a `<!-- autodocs:keep -->`
region. If a step above fails, stop and report it rather than working around
it. If a script fails with a missing-dependency or missing-browser error,
the `SessionStart` hook that installs them may not have finished yet or may
have failed — check `${CLAUDE_PLUGIN_DATA}/package.json` exists and suggest
restarting the session before troubleshooting further.
