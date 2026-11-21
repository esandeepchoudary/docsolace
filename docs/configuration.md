---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
description: ".env.example documents two variables, which map to the usernameEnv and passwordEnv fields of an auth profile in docsolace.config.yaml. Copy the file to .env…"
last_verified: "2026-11-21 (dd8f119)"
---

# Configuration

## Environment variables

`.env.example` documents two variables, which map to the `usernameEnv` and `passwordEnv` fields of an auth profile in `docsolace.config.yaml`. Copy the file to `.env` and fill it in; `.env` is gitignored and real credentials should never be committed.

`DOCSOLACE_STANDARD_USER_USERNAME` holds the username for the `standard-user` auth profile.

`DOCSOLACE_STANDARD_USER_PASSWORD` holds the password for the `standard-user` auth profile.

## Top-level keys in docsolace.config.yaml

`baseUrl` is the address of the running app to capture.

`viewports` is a map of named sizes (each with `width` and `height`). Every capture point is shot at each viewport, on the same page and session. The first entry is the primary one used for the login flow itself.

`outputDir` is where artifacts are written; `.docsolace/artifacts` in this repo.

`defaultMask` is a list of selectors masked on every capture, in addition to a tour's own `mask` list, to keep volatile regions such as timestamps and avatars out of every tour.

`runTrigger` is the intended cadence for the docs pipeline, informational only. Options are `manual-only` (default), `merge-to-main`, and `release-tag`. GitHub Actions triggers are static YAML, so the `on:` block of `.github/workflows/docs.yml` must be kept in sync by hand.

`pixelDiffThreshold` is the fraction of changed pixels that must be exceeded before a recaptured screenshot replaces the committed one in `docs/images/`. It keeps binary git churn out of history for visually insignificant re-renders.

## auth

Auth profiles are referenced by tours' `preconditions.auth`. Storage state from a successful login is cached under `<outputDir>/.auth/<profile-id>.json` and reused across runs instead of logging in per capture. The profile in this repo, `standard-user`, uses `loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector`, `usernameEnv`, `passwordEnv`, and `successUrlPattern`.

## seeds and allowSeedCommands

`seeds` is a map of named seed fixtures referenced by tours' `preconditions.seed`. A seed has a `description` and may declare a `command`, such as a script that resets or seeds a database, which runs before the tour. The demo seed here has no command and is treated as a no-op.

`allowSeedCommands` is off by default on purpose: a seed's command is config, and config is as reachable by an unreviewed change as tour YAML is. Set it to `true` only once you trust every declared seed command. The capture script also accepts `--allow-seed-commands` as a one-off override.

## docs

`docs.primaryViewport` names the viewport (a key under `viewports`) that stays inline in every step; the default is the first key. `docs.collapseOtherViewports`, when true, collapses every other viewport's screenshot into a details block; false restores the flat, all-inline layout.

`docs.sections` groups tour pages in the generated sidebar. Each entry has a `label` and a `tours` list in reading order; a tour named in no section sorts into one flat group instead.

`docs.stampVerified` stamps each generated page with a real last-verified date and short commit SHA, in frontmatter and as a visible line under the title. It is off by default and turned on in this repo.

## product

`product.name` is optional and defaults to the `name` in `package.json`. `product.pages` selects which product pages to write; the default is all seven, and pages with nothing to ground them are skipped. `product.sources` lists extra grounding files or globs beyond the standing set (`README.md`, `package.json`, `.env.example`, `docsolace.config.yaml`, `CHANGELOG.md`, `docs/adr/*.md`). Entries must be project-relative globs, with no absolute paths and no `..` segments. This repo lists `CONFIGURATION.md`, `PUBLISHING.md`, `TROUBLESHOOTING.md`, `ADVANCED.md`, and `CONTRIBUTING.md`. Product pages never read `.env`, key or credential files, or anything under a `.auth/` directory, whatever a glob matches.

## Design-skill styling

If a design or brand skill is installed, `/docsolace:document` auto-detects it and applies it to the Docusaurus site theme and to a small set of page-layout settings stored in a committed `.docsolace/doc-style.json`. This changes presentation only, never what is written. Passing `--no-style` skips detection for a run. With no design skill installed, docs are plain and unbranded.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
