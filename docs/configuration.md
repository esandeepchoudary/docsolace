---
sidebar_position: 4
sidebar_label: "Configuration"
title: "Configuration"
---

# Configuration

## Environment variables (.env.example)

`AUTODOCS_STANDARD_USER_USERNAME` and `AUTODOCS_STANDARD_USER_PASSWORD` map to the `usernameEnv`/`passwordEnv` fields of `autodocs.config.yaml`'s auth profiles. Copy `.env.example` to `.env` and fill in real values — `.env` is gitignored and real credentials must never be committed.

## Core autodocs.config.yaml fields

`baseUrl` is the app's local base URL. `viewports` is a map of named viewport sizes (this repository uses `desktop` at 1280x800 and `mobile` at 390x844) that every capture point is shot at, in the same page/session, with the first entry used as the primary one for the login flow. `outputDir` sets where capture artifacts are written (`.autodocs/artifacts` here). `defaultMask` lists selectors masked on every capture in addition to a tour's own `mask` list, keeping common volatile regions (this repository masks `.timestamp` and `.user-avatar`) out of every tour spec. `runTrigger` records the intended cadence for the docs pipeline (`manual-only` here, since this is a solo-developer tool) — informational only, since `.github/workflows/docs.yml`'s trigger must be kept in sync by hand. `pixelDiffThreshold` (`0.005` here) is the fraction of changed pixels a recaptured screenshot must exceed before it replaces the committed one, keeping insignificant re-renders out of git history.

## Auth, seeds, and allowSeedCommands

The `auth` map declares login profiles referenced by tours' `preconditions.auth`, either scripted username/password fields or a `storageStatePath` for a pre-recorded session (needed for OAuth/SSO/2FA/magic-link logins). The `seeds` map declares named fixtures referenced by tours' `preconditions.seed`; a seed can optionally include a `command`, but commands only run when `allowSeedCommands` is set to `true` in config (or `--allow-seed-commands` is passed to `capture`) — off by default so a fresh clone can never execute a command just because a seed declares one.

## docs section

`docs.primaryViewport` names which viewport's screenshot stays inline in a generated page (others collapse into a `<details>` block); `docs.collapseOtherViewports` toggles that behavior (`false` restores the old flat, all-inline layout); `docs.stampVerified` (opt-in, default off) stamps each page's frontmatter with a `last_verified` date and commit, advancing only when the page is actually regenerated. `docs.sections` groups tour pages into named categories in the generated sidebar.

## product section

`product.name` optionally overrides the product name used in generated pages (defaults to `package.json`'s name). `product.pages` lists which of the six product pages to generate (default: all six — configuration/troubleshooting/changelog are simply skipped when there's nothing to ground them in). `product.sources` lists extra project-relative glob paths providing additional grounding for product-scribe beyond the standing README/package.json/.env.example/autodocs.config.yaml/CHANGELOG.md set — in this project it currently lists CONFIGURATION.md, PUBLISHING.md, TROUBLESHOOTING.md, ADVANCED.md, and CONTRIBUTING.md, since the README was split into these companion files.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
