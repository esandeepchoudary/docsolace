---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
description: "The .env.example file is copied to .env, which is gitignored; real credentials should never be committed. Its keys map to the usernameEnv and passwordEnv…"
last_verified: "2026-11-21 (799ed0b)"
---

# Configuration

## Environment variables

The `.env.example` file is copied to `.env`, which is gitignored; real credentials should never be committed. Its keys map to the `usernameEnv` and `passwordEnv` fields of the auth profiles in `docsolace.config.yaml`.

`DOCSOLACE_STANDARD_USER_USERNAME` is the username for the `standard-user` auth profile.

`DOCSOLACE_STANDARD_USER_PASSWORD` is the password for the `standard-user` auth profile.

## Core settings

`baseUrl` is the address of the running app, `http://localhost:5173` in this repo.

`viewports` is a map of names to `width` and `height`. Every capture point is shot at each viewport, and only the viewport size changes between shots. The first entry is the primary one used for the login flow.

`outputDir` is where artifacts go (`.docsolace/artifacts` here).

`defaultMask` is a list of selectors masked on every capture, in addition to a tour's own `mask` list.

`pixelDiffThreshold` is the fraction of changed pixels above which a recaptured screenshot replaces the committed one in `docs/images/`. It keeps binary git churn out of history for visually insignificant re-renders.

`runTrigger` is the intended cadence for the docs pipeline. It is informational, because GitHub Actions triggers are static YAML and `.github/workflows/docs.yml` must be kept in sync by hand. Options are `manual-only` (the default), `merge-to-main` and `release-tag`.

## Auth profiles

The `auth` section defines profiles referenced by tours' `preconditions.auth`. A scripted-login profile uses `loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector`, `usernameEnv`, `passwordEnv` and `successUrlPattern`. Storage state from a successful login is cached under `<outputDir>/.auth/<profile-id>.json` and reused across runs instead of logging in per capture.

A profile with `storageStatePath` instead reuses a pre-exported session. See `ADVANCED.md` for non-password logins.

## Seeds

The `seeds` section declares named seed fixtures referenced by tours' `preconditions.seed`. Each has a `description` and an optional `command`. In this repo's demo seed there is no command, so it is a no-op.

`allowSeedCommands` is `false` by default on purpose. A seed's command is config, and config is as reachable by an unreviewed change as tour YAML, so both are treated as untrusted for anything that shells out. Set it to `true` only once you trust every declared seed command. The capture script also accepts `--allow-seed-commands` as a one-off override.

## Page layout (docs)

`docs.primaryViewport` names the viewport whose screenshot stays inline in each step. It must be a key under `viewports`, and it defaults to the first key.

`docs.collapseOtherViewports` collapses every other viewport's screenshot into a `<details>` block. Setting it to `false` restores a flat, all-inline layout.

`docs.stampVerified` is off by default. When `true`, it stamps each page's frontmatter with a last-verified date and short commit SHA. In this repo it is on, so the pages also show it as a visible line under the title.

`docs.sections` groups tour pages into labeled sidebar categories, each with a `label` and a `tours` list in reading order. Tours named in no section sort into one flat group. This repo has one section, `Tutorials`, containing `login`, `dashboard-overview` and `dashboard-export`.

## Product pages (product)

`product.name` is optional and defaults to the `name` in `package.json`.

`product.pages` lists which product pages to write. The default is all seven, and pages with nothing to ground them are skipped.

`product.sources` lists extra grounding files or globs beyond the standing set (`README.md`, `package.json`, `.env.example`, `docsolace.config.yaml`, `CHANGELOG.md`, `docs/adr/*.md`). Entries must be project-relative globs with no absolute paths and no `..` segments. This repo lists `CONFIGURATION.md`, `PUBLISHING.md`, `TROUBLESHOOTING.md`, `ADVANCED.md` and `CONTRIBUTING.md`.

Product pages never read `.env`, key or credential files, or anything under a `.auth/` directory, whatever a glob matches.

## Tour step options

Steps can carry `expectUrl` and `expectVisible`, which fail the run with `AUTH_EXPIRED_OR_UNEXPECTED_PAGE` instead of screenshotting the wrong page, typically an expired session redirected to `/login`. `waitFor` on a `goto`, `click` or `upload` step waits for a given element instead of network idle. A capture step's `highlight` outlines an element, and its color can be overridden through `page.highlightColor` in `.docsolace/doc-style.json`. `CONFIGURATION.md` lists every step action and its fields.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
