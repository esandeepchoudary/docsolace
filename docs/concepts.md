---
sidebar_position: 3
sidebar_label: "Concepts"
title: "Concepts"
description: "A tour is a YAML file under tours/ that describes one feature walk: the pages to visit, what to click, and where to take screenshots. It has an id, a title, an…"
last_verified: "2026-11-21 (339898a)"
---

# Concepts

## Tour

A tour is a YAML file under `tours/` that describes one feature walk: the pages to visit, what to click, and where to take screenshots. It has an `id`, a `title`, an `intent`, `steps`, and `code_paths` (source files that, if they change, mark the tour as dirty). Each step is an action (`goto`, `click`, `fill`, `type`, `select`, `check`, `press`, `hover`, `upload`, `wait`) or a capture, which takes a screenshot and an accessibility snapshot at that point.

Two optional top-level fields, `prerequisites` and `see_also`, list other tour ids and render as "Before you start" and "See also" link lists on the generated page. A capture step can also take a `highlight` locator that outlines an element in the screenshot.

This project's tours are `login`, `dashboard-overview` and `dashboard-export`.

## Tour status and maturity

A tour's `maturity` can be `stable` or `draft` (still churning, skipped until flipped). Its `status` can be `confirmed` (ready to use), `proposed` (drafted but not yet reviewed), or `archived` (the feature looks removed).

## Capture, viewports and masking

Every capture is shot once at each entry in the `viewports` map of `docsolace.config.yaml`. Volatile regions such as timestamps and avatars are masked, either through `defaultMask` in the config (applies to every tour) or a tour's own `mask` list, so they do not cause false "changed" results. Selectors should prefer role-based locators such as `role=button[name='...']` over CSS.

## Drift check

The drift check compares a tour's screenshots and `code_paths` source against the last run. If nothing changed, the tour is skipped. A recaptured screenshot only replaces the committed one when the fraction of changed pixels exceeds `pixelDiffThreshold`.

## Keep regions

Text placed between `<!-- docsolace:keep -->` markers in a generated page is human-owned and survives every regeneration.

## Auth profiles and seeds

An auth profile in `docsolace.config.yaml` tells the capture how to sign in, and tours reference it through `preconditions.auth`. A seed is a named fixture referenced through `preconditions.seed`. A seed may declare a `command`, but it only runs when `allowSeedCommands` is true.

## Product pages

Product pages are the repository-level pages (`overview`, `getting-started`, `concepts`, `configuration`, `troubleshooting`, `changelog`, `decisions`) written by `product-scribe`. They are grounded in `README.md`, `package.json`, `.env.example`, `docsolace.config.yaml`, `CHANGELOG.md`, any `docs/adr/*.md`, extra `product.sources` globs and the tour inventory. A page with nothing to ground it is skipped and reported. The `decisions` page only surfaces reasoning a human wrote down in an ADR.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
