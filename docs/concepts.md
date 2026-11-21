---
sidebar_position: 3
sidebar_label: "Concepts"
title: "Concepts"
description: "A tour is a YAML file under tours/ describing one feature walk: an id, title, intent, a list of steps, and optional code_paths. A step is either an action…"
last_verified: "2026-11-21 (0cc9a45)"
---

# Concepts

## Tour

A tour is a YAML file under `tours/` describing one feature walk: an `id`, `title`, `intent`, a list of `steps`, and optional `code_paths`. A step is either an action (`goto`, `click`, `fill`, `type`, `select`, `check`, `press`, `hover`, `upload`, `wait`) or a `capture` that takes a screenshot plus an accessibility snapshot. Role-based selectors such as `role=button[name='...']` are preferred over CSS.

## Maturity and status

`maturity: draft` marks a tour that is still changing and is skipped until flipped. `status` is `confirmed` (ready to use), `proposed` (drafted but not yet reviewed), or `archived` (the feature looks removed). Archived tours are skipped by capture, drift, generate, and validate, and their pages move under `docs/archive/` rather than being deleted.

## Capture and viewports

Every capture is taken once per entry in the `viewports` map of `docsolace.config.yaml`, in the same page and session. Volatile regions such as timestamps and avatars are masked, through `defaultMask` or a capture's own `mask` list, so they do not cause false changes. An optional `highlight` on a capture outlines an element in the screenshot.

## Drift check

The drift check decides whether a tour needs regenerating by comparing screenshots, accessibility snapshots, and the contents of its `code_paths` against the last run. Pixel changes below `pixelDiffThreshold` do not count; an accessibility-snapshot change does.

## Keep region

Content between `<!-- docsolace:keep -->` and `<!-- /docsolace:keep -->` in a generated page is human-owned and survives regeneration. If a page is edited outside that region, generation refuses to overwrite it silently.

## Auth profile

An auth profile, defined under `auth` in `docsolace.config.yaml` and referenced by a tour's `preconditions.auth`, lets captures run signed in. A scripted profile uses a login URL, selectors, and environment variables for credentials. A profile with `storageStatePath` instead reuses a pre-recorded session, which supports OAuth, SSO, magic links, and 2FA.

## Seed

A seed is a named fixture under the `seeds` map, referenced by a tour's `preconditions.seed`, so a data-dependent flow captures against the same data each run. A seed may declare a `command`, but it only runs when `allowSeedCommands` is true.

## Cross-links

A tour may list other tour ids under `prerequisites` and `see_also`. These render as "Before you start" and "See also" link lists on the generated page, using the target tour's title.

## Product pages

Product pages describe the product rather than one UI flow. They are written by the `product-scribe` subagent from repository files and the tour inventory, and a page with nothing to ground it is skipped.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
