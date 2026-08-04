---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
description: "The project's .env.example documents two variables that map to the usernameEnv/passwordEnv fields of an auth profile in docsolace.config.yaml:…"
last_verified: "2026-08-04 (370b5a3)"
---

# Configuration

## Environment variables (.env.example)

The project's `.env.example` documents two variables that map to the `usernameEnv`/`passwordEnv` fields of an auth profile in `docsolace.config.yaml`: `DOCSOLACE_STANDARD_USER_USERNAME` and `DOCSOLACE_STANDARD_USER_PASSWORD`. The file is meant to be copied to `.env` and filled in; `.env` is gitignored and real credentials should never be committed.

## docsolace.config.yaml — core fields

`baseUrl` is the app's local base URL. `viewports` is a map of named viewport sizes (this repo defines `desktop` and `mobile`); every capture point is shot once per entry in this map, and the first entry is the "primary" viewport used for the login flow itself. `outputDir` sets where capture artifacts are written (`.docsolace/artifacts` here). `defaultMask` lists selectors masked on every capture in addition to a tour's own `mask` list, keeping common volatile regions like timestamps and avatars out of every tour spec. `runTrigger` is an informational field describing the intended cadence for the docs pipeline (`manual-only`, `merge-to-main`, or `release-tag`) — it doesn't itself control GitHub Actions, since workflow triggers are static YAML that must be kept in sync by hand in `.github/workflows/docs.yml`. `pixelDiffThreshold` is the fraction of changed pixels a recaptured screenshot must exceed before it replaces the committed one in `docs/images/`, keeping binary git churn out of history for visually-insignificant re-renders.

## Auth, seeds, and the seed-command gate

`auth` is a map of named profiles referenced by a tour's `preconditions.auth`; storage state from a successful login is cached under `<outputDir>/.auth/<profile-id>.json` and reused across runs. `seeds` is a map of named fixtures referenced by a tour's `preconditions.seed`; a seed with only a `description` and no `command` is treated as a no-op (as with this repo's own `demo-baseline`, since the demo app's data is static). `allowSeedCommands` (default `false`) is the explicit, off-by-default gate that must be set to `true` — or overridden per-run with `--allow-seed-commands` — before any seed's declared `command` is actually executed, since a seed command is config and config is exactly as reachable by an unreviewed change as tour YAML is.

## docs: page layout and styling

The `docs` section controls generated page layout: `primaryViewport` names which viewport's screenshot stays inline in a generated page (every other viewport's screenshot collapses into a `<details>`/`<summary>` block); `collapseOtherViewports` (default `true`) can be set to `false` to restore a flat, all-inline layout; `stampVerified` (opt-in, default off) stamps each page's frontmatter with a `last_verified` date/commit, only advancing when the page is actually regenerated. Separately, every generated page always gets a `description` frontmatter field — a tour's own `intent`, or `product-scribe`'s own first section, stripped of markdown and truncated — so each page's search/answer-engine meta description is specific to that page instead of a site-wide tagline; this needs no configuration and is simply omitted when there's nothing to ground it in.

## product: sources, pages, and sidebar sections

`product.sources` lists extra project-relative globs of files that feed the `product-scribe` subagent beyond the standing `README.md`/`package.json`/`.env.example`/`docsolace.config.yaml`/`CHANGELOG.md`/`docs/adr/*.md` set — this repo's own config lists `CONFIGURATION.md`, `PUBLISHING.md`, `TROUBLESHOOTING.md`, `ADVANCED.md`, and `CONTRIBUTING.md`, since its README was split into these companion pages. `product.pages` and `product.name` let a project pick which of the seven product pages to generate (default: all seven — overview, getting-started, concepts, configuration, troubleshooting, changelog, decisions) and override the product's displayed name (defaulting to `package.json`'s `name`). `docs.sections` groups tour pages into labeled sections in the generated sidebar (`docs/_sidebar.docsolace.json`); a tour named in no section sorts into a flat "everything else" group instead. The `decisions` page needs no config at all — dropping one or more files under `docs/adr/*.md` is enough for it to be picked up automatically. `product-scribe` never reads `.env`, key/credential-shaped files, or anything under a `.auth/` directory, regardless of what a configured glob would otherwise match.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
