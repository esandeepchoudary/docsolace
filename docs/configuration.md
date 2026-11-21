---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
description: ".env.example is copied to .env, which is gitignored; real credentials are never committed. The variables map to the usernameEnv and passwordEnv fields of the…"
last_verified: "2026-11-20 (7943237)"
---

# Configuration

## Environment variables

`.env.example` is copied to `.env`, which is gitignored; real credentials are never committed. The variables map to the `usernameEnv` and `passwordEnv` fields of the auth profiles in `docsolace.config.yaml`.

- `DOCSOLACE_STANDARD_USER_USERNAME`: the username for the `standard-user` auth profile.
- `DOCSOLACE_STANDARD_USER_PASSWORD`: the password for the `standard-user` auth profile.

## docsolace.config.yaml: capture settings

- `baseUrl`: the base URL of the app being captured.
- `viewports`: a map of named viewports with `width` and `height`. Every capture point is shot at each one. The first entry is the primary one used for the login flow itself.
- `outputDir`: where artifacts are written (`.docsolace/artifacts` in this repository).
- `defaultMask`: selectors masked on every capture, in addition to a tour's own `mask` list, to keep common volatile regions out of every tour spec.
- `pixelDiffThreshold`: a recaptured screenshot only replaces the committed one in `docs/images/` when the fraction of changed pixels exceeds this threshold, which keeps binary git churn out of history.
- `runTrigger`: the intended cadence for the docs pipeline. It is informational, because GitHub Actions triggers are static YAML and `.github/workflows/docs.yml`'s `on:` block must be kept in sync by hand. Options are `manual-only` (the default), `merge-to-main` and `release-tag`.

## docsolace.config.yaml: auth

`auth` holds profiles referenced by tours' `preconditions.auth`. Storage state from a successful login is cached under `<outputDir>/.auth/<profile-id>.json` and reused across runs. A scripted profile uses `loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector`, `usernameEnv`, `passwordEnv` and `successUrlPattern`. A profile with `storageStatePath` instead reuses a pre-exported session, and the scripted fields are not used. The session is recorded with `save-auth-state.mjs`, run in your own terminal.

## docsolace.config.yaml: seeds

`seeds` declares named fixtures referenced by tours' `preconditions.seed`. A seed has a `description` and an optional `command`. `allowSeedCommands` is `false` by default: a seed's command is config, and config is as reachable by an unreviewed change as tour YAML is, so it only runs when this is set to `true`. `--allow-seed-commands` on `capture` is a one-off override.

## docsolace.config.yaml: docs

The `docs` section controls generated page layout.

- `primaryViewport`: which viewport stays inline in every step. It must name a key under `viewports`, and defaults to the first key.
- `collapseOtherViewports`: when `true`, every other viewport's screenshot collapses into a `<details>` block. Setting it to `false` restores a flat, all-inline layout.
- `sections`: groups tour pages in the generated sidebar, as a list of entries with a `label` and a list of `tours`. Order is reading order. Product pages always pin above every section.
- `stampVerified`: when `true`, stamps each generated page with a "last verified" date and short commit SHA, in frontmatter and as a visible line under the title. It is off by default.

## docsolace.config.yaml: product

The `product` section feeds the product pages. `sources` lists extra grounding files or globs beyond the standing set (`README.md`, `package.json`, `.env.example`, `docsolace.config.yaml`, `CHANGELOG.md`, `docs/adr/*.md`). Entries must be project-relative globs, with no absolute paths or `..` segments. `name` optionally overrides the product name, which defaults to `package.json`'s name, and `pages` selects which pages to write (default: all seven). Product pages never read `.env`, key or credential files, or anything under `.auth/`.

## docsolace.config.yaml: crawl

Used by `/docsolace:document map`. `crawl.maxPages` (default 50) and `crawl.maxDepth` (default 4) bound the discovery crawl. `crawl.allowInteractive` (default `false`) is the second of two opt-ins needed for interactive mode, which also requires the `--interactive` flag. Set it to `true` only against a throwaway or dev environment.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
