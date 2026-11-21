---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
description: ".env.example is copied to .env, which is gitignored; real credentials should never be committed. Its two keys feed the usernameEnv and passwordEnv fields of an…"
last_verified: "2026-11-21 (0cc9a45)"
---

# Configuration

## Environment variables

`.env.example` is copied to `.env`, which is gitignored; real credentials should never be committed. Its two keys feed the `usernameEnv` and `passwordEnv` fields of an auth profile in `docsolace.config.yaml`:

- `DOCSOLACE_STANDARD_USER_USERNAME`: the username for the `standard-user` auth profile.
- `DOCSOLACE_STANDARD_USER_PASSWORD`: the password for the `standard-user` auth profile.

## Core settings in docsolace.config.yaml

- `baseUrl`: the app's base URL (`http://localhost:5173` in this repo).
- `viewports`: a map of named sizes (`desktop` and `mobile` here). Every capture point is shot at each one. The first entry is the primary one used for the login flow.
- `outputDir`: where artifacts are written (`.docsolace/artifacts`).
- `defaultMask`: selectors masked on every capture in addition to a tour's own `mask` list, to keep volatile regions such as timestamps and avatars out of every tour.
- `runTrigger`: the intended cadence for the docs pipeline. It is informational, because GitHub Actions triggers are static YAML and `.github/workflows/docs.yml` must be kept in sync by hand. Options are `manual-only` (default), `merge-to-main`, and `release-tag`.
- `pixelDiffThreshold`: a recaptured screenshot replaces the committed one only when the fraction of changed pixels exceeds this value (`0.005` here).
- `allowSeedCommands`: off by default. A seed's `command` runs only when this is true, because config is as reachable by an unreviewed change as tour YAML. `capture` also accepts `--allow-seed-commands` as a one-off override.

## auth

Auth profiles are referenced by tours' `preconditions.auth`. Storage state from a successful login is cached under `<outputDir>/.auth/<profile-id>.json` and reused across runs. A scripted profile has `loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector`, `usernameEnv`, `passwordEnv`, and `successUrlPattern`. A profile can instead set `storageStatePath` to reuse a session recorded once with `save-auth-state.mjs`, for logins that are not a plain username and password form.

## seeds

Named fixtures referenced by a tour's `preconditions.seed`. Each has a `description` and an optional `command`. The demo app's `demo-baseline` seed has no command and is a no-op, because its demo data is static.

## docs

Controls generated page layout.

- `primaryViewport`: which viewport's screenshot stays inline. It must name a key under `viewports`, and the default is the first key.
- `collapseOtherViewports`: when true, other viewports collapse into a `<details>` block; false restores the flat, all-inline layout.
- `sections`: groups tour pages in the generated sidebar, each with a `label` and a list of `tours`, in reading order. Product pages always pin above every section.
- `stampVerified`: opt-in, default off. Stamps each page with a last-verified date and short commit SHA in frontmatter and as a visible line under the title. It only advances when the page is actually regenerated.

A change to the `docs:` block or to `.docsolace/doc-style.json` re-renders existing pages on the next run without `--force`.

## product

- `name`: optional; defaults to the `name` in `package.json`.
- `pages`: which product pages to write. The default is all seven, and pages with nothing to ground them are skipped.
- `sources`: extra project-relative globs (no absolute paths, no `..` segments) used as grounding beyond the standing set of `README.md`, `package.json`, `.env.example`, `docsolace.config.yaml`, `CHANGELOG.md`, and `docs/adr/*.md`. This repo lists `CONFIGURATION.md`, `PUBLISHING.md`, `TROUBLESHOOTING.md`, `ADVANCED.md`, and `CONTRIBUTING.md`.

`product-scribe` never reads `.env`, key or credential files, or anything under a `.auth/` directory.

## crawl

Optional section used by `/docsolace:document map`:

```yaml
crawl:
  maxPages: 50
  maxDepth: 4
  allowInteractive: false
```

`maxPages` and `maxDepth` bound the discovery crawl (defaults 50 pages, depth 4). `allowInteractive` must be true, in addition to the `--interactive` flag, before the crawler fills forms or clicks buttons. Only set it against a throwaway or dev environment.

## Tour step fields

Steps accept optional `expectUrl` and `expectVisible` assertions. A mismatch fails the tour with `AUTH_EXPIRED_OR_UNEXPECTED_PAGE` instead of screenshotting the wrong page, which is usually an expired session redirecting to `/login`. `waitFor` (on `goto`, `click`, and `upload` steps) waits for a given element instead of network idle.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
