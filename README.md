# AutoDocs

Drives a running web app in a headless browser, captures feature screenshots,
and (soon) generates tutorial-style Markdown docs that stay in sync with the
app. See `autodocs-implementation-brief.md` for the full design and phased
build order, and `CLAUDE.md` for project conventions.

## Status

- **Phase 0** — scaffold + deterministic capture proof: done.
- **Phase 1** — tour-driven capture runner (auth, multi-step, masking, a11y
  snapshots, manifest): done.
- **Phase 2** — doc generator (grounded Markdown from captures, surgical
  keep-region updates): done, one tour's worth of prose so far.
- **Phase 3** — drift gate (only dirty tours regenerate) + pixel-diff-gated
  screenshot commits: done.
- **Phase 4+** — plugin packaging, publishing: not started.

## Layout

```
demo-app/                  React + Vite app used to exercise the pipeline (login + dashboard)
tours/*.yaml               Declarative feature walks (steps, preconditions, masking)
scripts/capture.mjs        Playwright runner: tour -> screenshots + a11y snapshots + manifest
scripts/generate-docs.mjs  Assembles docs/<tour-id>.md from a tour's captures, gated by drift + pixel-diff
scripts/drift.mjs          Reports which tours are dirty, without changing anything
scripts/lib/               Unit-tested helpers (config/tour loading, hashing, manifest,
                           doc templating, drift/state, pixel-diff)
autodocs.config.yaml       Base URL, viewport, auth profiles, seed fixtures, pixel-diff threshold
docs/                      Generated tutorials (images + markdown); edits inside
                           `<!-- autodocs:keep -->` blocks survive regeneration
.autodocs/artifacts/       Capture output + state.json lockfile (gitignored)
```

## Setup

```bash
npm install
cp .env.example .env   # demo login credentials
cd demo-app && npm install
```

## Run it

```bash
# start the demo app
cd demo-app && npm run dev   # http://localhost:5173

# in another terminal, capture a tour
npm run capture -- --tour login       # public login page
npm run capture -- --tour dashboard   # dashboard (logs in, applies filters)
```

Output lands in `.autodocs/artifacts/`: `screenshots/<tour-id>/`,
`snapshots/<tour-id>/` (accessibility snapshots), and `manifest.json`
(per-capture SHA-256, computed after masking).

Then generate the tutorial page from those captures:

```bash
npm run generate-docs -- --tour login
npm run generate-docs -- --tour dashboard
```

Writes `docs/<tour-id>.md` + copies its screenshots into `docs/images/`. Any
text you add inside the `<!-- autodocs:keep -->` block at the bottom of a
page survives the next regeneration.

`generate-docs` only regenerates a tour if it's actually changed (its
screenshots or its `code_paths` source) since the last generation — see
`.autodocs/artifacts/state.json`. A recaptured screenshot only replaces the
one committed under `docs/images/` if enough pixels changed
(`pixelDiffThreshold` in the config); otherwise the existing image is left
alone to avoid binary git churn. To see what's dirty without generating
anything:

```bash
npm run drift
```

## Test

```bash
npm test
```
