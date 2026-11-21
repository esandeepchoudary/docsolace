---
sidebar_position: 3
sidebar_label: "Concepts"
title: "Concepts"
description: "A tour is a YAML file under tours/ describing a feature walk: pages to visit, what to click, and where to screenshot. It has an id, title, intent, steps, and…"
last_verified: "2026-11-21 (dd8f119)"
---

# Concepts

## Tour

A tour is a YAML file under `tours/` describing a feature walk: pages to visit, what to click, and where to screenshot. It has an `id`, `title`, `intent`, `steps`, and `code_paths` (source files that, if changed, mark the tour dirty). Each step is either an action (`goto`, `click`, `fill`, `type`, `select`, `check`, `press`, `hover`, `upload`, `wait`) or a capture with a `description`. A capture can take an optional `highlight` locator that outlines an element in the screenshot. Role-based selectors such as `role=button[name='...']` are preferred over CSS.

This project's own tours are `login` ("Login page": what a signed-out user sees before authenticating), `dashboard-overview` ("Dashboard overview": what the main dashboard displays and how to read it), and `dashboard-export` ("Export dashboard activity": exporting the current activity table as a CSV).

## Maturity and status

A tour's `maturity` of `draft` means it is still churning and is skipped until flipped. Its `status` is `confirmed` (ready to use), `proposed` (drafted, not yet reviewed), or `archived` (the feature looks removed). A tour may also list other tour ids under `prerequisites` and `see_also`, which render as "Before you start" and "See also" link lists on its page.

## Capture and viewports

Capture drives a headless browser through a tour at every viewport configured under `viewports` (desktop and mobile by default) and saves an accessibility snapshot with each screenshot. In generated pages, one viewport stays inline and the others collapse into a details block.

## Drift check

The drift check compares a tour's screenshots and source `code_paths` against the last run and skips tours that haven't changed. Volatile regions such as timestamps and avatars should be masked, through `defaultMask` or a tour's own `mask` list, so they don't cause false changes.

## Keep regions

Text inside `<!-- docsolace:keep -->` blocks is human-owned and survives every regeneration.

## Auth profiles and seeds

An auth profile in `docsolace.config.yaml` describes how to sign in so tours can capture signed-in pages; the session from a successful login is cached and reused. A seed is a named fixture referenced from a tour's `preconditions.seed`; a seed's optional command only runs when `allowSeedCommands` is true.

## Product pages

Product pages describe the product itself rather than one UI flow: `overview`, `getting-started`, `concepts`, `configuration`, `troubleshooting`, `changelog`, and `decisions`. They are grounded in repository files and the tour inventory, never in the running app. The `decisions` page only surfaces reasoning a human wrote down in an ADR file under `docs/adr/`.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
