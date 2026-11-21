---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
description: ".env.example is meant to be copied to .env and filled in. .env is gitignored, and real credentials should never be committed. The variables map to the…"
last_verified: "2026-11-21 (339898a)"
---

# Configuration

## Environment variables

`.env.example` is meant to be copied to `.env` and filled in. `.env` is gitignored, and real credentials should never be committed. The variables map to the `usernameEnv` and `passwordEnv` fields of the auth profiles in `docsolace.config.yaml`.

- `DOCSOLACE_STANDARD_USER_USERNAME`: the username for the `standard-user` auth profile.
- `DOCSOLACE_STANDARD_USER_PASSWORD`: the password for the `standard-user` auth profile.

## Core settings in docsolace.config.yaml

- `baseUrl`: the address of the app being captured (`http://localhost:5173` in this repo).
- `viewports`: every capture point is shot at each viewport, on the same page and session. The first entry is the primary one used for the login flow. This repo defines `desktop` (1280 by 800) and `mobile` (390 by 844).
- `outputDir`: where artifacts are written (`.docsolace/artifacts`).
- `defaultMask`: selectors masked on every capture, in addition to a tour's own `mask` list. This repo masks `.timestamp` and `.user-avatar`.
- `runTrigger`: the intended cadence for the docs pipeline. It is informational only, since GitHub Actions triggers are static YAML and `.github/workflows/docs.yml` must be kept in sync by hand. Options are `manual-only` (default), `merge-to-main` and `release-tag`.
- `pixelDiffThreshold`: a recaptured screenshot only replaces the committed one in `docs/images/` when the fraction of changed pixels exceeds this value (`0.005` here). This keeps binary git churn out of history for visually insignificant re-renders.

## Auth profiles

The `auth` map defines profiles referenced by tours' `preconditions.auth`. Storage state from a successful login is cached under `<outputDir>/.auth/<profile-id>.json` and reused across runs. The `standard-user` profile in this repo uses `loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector`, `usernameEnv`, `passwordEnv` and `successUrlPattern`.

A profile can instead set `storageStatePath` to reuse a pre-exported session, in which case the scripted-login fields are not used.

## Seeds

The `seeds` map names fixtures referenced by tours' `preconditions.seed`. A seed can carry a `description` and an optional `command` that runs before the tour. The `demo-baseline` seed in this repo has no command, so it is a no-op.

`allowSeedCommands` is `false` by default on purpose: a seed's command is config, and config is as reachable by an unreviewed change as tour YAML, so both are treated as untrusted input for anything that shells out. Set it to `true` only once you trust every declared seed command. `capture.mjs` also accepts `--allow-seed-commands` as a one-off override.

## Page layout: the docs section

The `docs` section controls generated page layout.

- `primaryViewport`: must name a key under `viewports`. That viewport stays inline in every step, and the default is the first key.
- `collapseOtherViewports`: when true, every other viewport's screenshot collapses into a `<details>` block. False restores a flat, all-inline layout.
- `sections`: groups tour pages into labeled categories in the generated sidebar, in reading order. This repo puts `login`, `dashboard-overview` and `dashboard-export` under one `Tutorials` label. Product pages always pin above every section.
- `stampVerified`: stamps each generated page with a "last verified" date and short commit SHA, in frontmatter and as a visible line under the title. It is off by default and on in this repo.

```yaml
docs:
  primaryViewport: desktop
  collapseOtherViewports: true
  stampVerified: false
```

## Product pages: the product section

The optional `product` section is consumed by `/document product` and the normal pipeline.

- `name`: an optional product name that defaults to the `name` in `package.json`.
- `pages`: which product pages to write. The default is all seven, and pages with nothing to ground them are skipped.
- `sources`: extra grounding files or globs beyond the standing set (`README.md`, `package.json`, `.env.example`, `docsolace.config.yaml`, `CHANGELOG.md`, `docs/adr/*.md`). Entries must be project-relative globs with no absolute paths and no `..` segments. This repo lists `CONFIGURATION.md`, `PUBLISHING.md`, `TROUBLESHOOTING.md`, `ADVANCED.md` and `CONTRIBUTING.md`.

`.env`, key and credential files, and anything under a `.auth/` directory are never read, whatever a glob matches.

## Design-skill styling

If a project has a design or brand skill installed, `/document` detects it and applies it to the scaffolded Docusaurus site's theme and to a committed `.docsolace/doc-style.json`. That file holds presentation knobs only, such as the "Steps" heading text, per-viewport summary labels, and `page.highlightColor` for the highlight outline color. It never changes what is written. Pass `--no-style` to skip detection for one run.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
