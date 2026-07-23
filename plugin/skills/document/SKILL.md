---
name: document
description: Captures the app's tours and regenerates docs for whichever tours actually changed, via the doc-scribe subagent. Invoke with a tour's file slug to limit the run to one tour (e.g. "/document dashboard"); with no argument, runs across every tour in tours/*.yaml.
argument-hint: "[tour-id]"
allowed-tools: Bash(npm run capture *) Bash(npm run drift *) Bash(npm run generate-docs *)
---

Run the AutoDocs pipeline: capture → drift gate → dispatch dirty tours to the
`doc-scribe` subagent → regenerate → summarize.

Target tour(s): $ARGUMENTS

If a tour file slug was given above, operate on just `tours/<slug>.yaml`.
Otherwise, operate on every `*.yaml` file in `tours/`.

## Steps

1. **Capture.** For each target tour, run:
   ```
   npm run capture -- --tour <slug>
   ```

2. **Check drift.** Run `npm run drift` to see which tours are dirty, clean,
   or draft (skipped entirely). Only dirty tours need regeneration — this is
   the whole point of the gate: don't waste a subagent call or rewrite a page
   that hasn't actually changed.

3. **Generate prose for dirty tours.** For each tour the drift check reports
   as dirty, invoke the `doc-scribe` subagent with that tour's file slug as
   its task input. Wait for it to write
   `.autodocs/artifacts/prose/<tour-id>.json` before continuing — do not
   write any prose yourself, that's the subagent's job, done in an isolated
   context so it doesn't pollute this session.

4. **Assemble.** For each dirty tour, once its prose file exists, run:
   ```
   npm run generate-docs -- --tour <slug>
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
it.
