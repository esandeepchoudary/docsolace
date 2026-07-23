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
- **Phase 3+** — drift gate, plugin packaging, publishing: not started.

## Layout

```
demo-app/              React + Vite app used to exercise the pipeline (login + dashboard)
tours/*.yaml           Declarative feature walks (steps, preconditions, masking)
scripts/capture.mjs    Playwright runner: tour -> screenshots + a11y snapshots + manifest
scripts/generate-docs.mjs  Assembles docs/<tour-id>.md from a tour's captures
scripts/lib/           Unit-tested helpers (config/tour loading, hashing, manifest, doc templating)
autodocs.config.yaml   Base URL, viewport, auth profiles, seed fixtures
docs/                  Generated tutorials (images + markdown); edits inside
                        `<!-- autodocs:keep -->` blocks survive regeneration
.autodocs/artifacts/   Capture output (gitignored)
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

## Test

```bash
npm test
```
