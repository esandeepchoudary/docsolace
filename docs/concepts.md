---
sidebar_position: 3
sidebar_label: "Concepts"
title: "Concepts"
description: "A tour is a YAML file under tours/ describing one feature walk: the pages to visit, what to click, and where to take screenshots. It has an id, title, intent,…"
last_verified: "2026-11-20 (7943237)"
---

# Concepts

## Tour

A tour is a YAML file under `tours/` describing one feature walk: the pages to visit, what to click, and where to take screenshots. It has an `id`, `title`, `intent`, `steps`, and optional `code_paths`. Each step has an `action` (`goto`, `click`, `fill`, `type`, `select`, `check`, `press`, `hover`, `upload`, or `wait`) or is a `capture` step that takes a screenshot and accessibility snapshot with a `description`. A capture step can take an optional `highlight` locator that outlines the element in the screenshot. Role-based selectors such as `role=button[name='...']` are preferred over CSS.

## Tour status and maturity

`status` is `confirmed` (ready to use), `proposed` (drafted but not yet reviewed) or `archived` (the feature looks removed). `maturity: draft` marks a tour that is still churning. Draft and proposed tours are skipped until flipped. Archiving moves the page under `docs/archive/` and never deletes the tour or its prose.

## Cross-links between tours

A tour can list other tour ids under `prerequisites` and `see_also`. They render as "Before you start" and "See also" link lists on the generated page, using the target tour's title. The links are produced mechanically, with no subagent involved.

## Viewports and capture

Every capture is shot once per entry in the `viewports` map (desktop and mobile by default), in the same page and session. By default only the primary viewport's screenshot is shown inline in a generated page, and the others collapse into a `<details>` block.

## Masking

Volatile regions such as timestamps, avatars and live data are masked, either globally through `defaultMask` in `docsolace.config.yaml` or per capture through a `mask` list. This keeps content that changes every run from being reported as a change.

## Drift check

The drift check compares a tour's screenshots and its source `code_paths` against the last run. A tour whose screenshots and source code are unchanged is skipped, which keeps the prose-generation step cheap.

## Keep regions

Text inside `<!-- docsolace:keep --> ... <!-- /docsolace:keep -->` is human-owned and survives every regeneration. A hand edit outside a keep region is detected, and the page is not silently overwritten.

## Auth profiles

Auth profiles under `auth` in `docsolace.config.yaml` are referenced by name from a tour's `preconditions.auth`. A profile either scripts a username and password login using selectors and environment variable names, or sets `storageStatePath` to reuse a session recorded once by a human in a real browser, which supports OAuth, SSO, magic-link and 2FA apps.

## Seeds

A seed is a named fixture under `seeds` in the config, referenced by a tour's `preconditions.seed`, so a data-dependent flow captures against the same data every run. A seed's optional `command` only runs when `allowSeedCommands` is `true`.

## Product pages

Product pages describe the product itself rather than one UI flow. There are up to seven (`overview`, `getting-started`, `concepts`, `configuration`, `troubleshooting`, `changelog`, `decisions`), grounded only in repository files and the tour inventory. The `decisions` page reflects only reasoning a human wrote in a `docs/adr/*.md` file.

## Included tours in this repository

This repository's own project has three tours: `login` (what a signed-out user sees before authenticating), `dashboard-overview` (what the main dashboard displays and how to read it), and `dashboard-export` (how to export the current activity table as a CSV).

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
