---
sidebar_position: 3
sidebar_label: "Concepts"
title: "Concepts"
description: "A tour is a YAML file under tours/ describing one feature walk: pages to visit, what to click, and where to screenshot. Its fields include id, title, intent,…"
last_verified: "2026-11-21 (799ed0b)"
---

# Concepts

## Tour

A tour is a YAML file under `tours/` describing one feature walk: pages to visit, what to click, and where to screenshot. Its fields include `id`, `title`, `intent`, `maturity`, `status`, `steps` and `code_paths`. A step is either an action (such as `goto`, `click`, `fill`, `wait`) or a capture, which takes a screenshot and an accessibility snapshot. Role-based selectors such as `role=button[name='...']` are preferred over CSS.

Two optional top-level fields, `prerequisites` and `see_also`, list other tour ids and render as "Before you start" and "See also" link lists on the generated page.

## Status and maturity

`maturity: draft` means a tour is still changing and is skipped until you flip it. `status: confirmed` means ready to use, `proposed` means drafted but not yet reviewed, and `archived` means the feature looks removed. Draft, proposed and archived tours are skipped by capture and drift checks.

## Capture and viewports

A capture is a screenshot plus an accessibility snapshot taken at a point in a tour. Every capture is shot once for each entry in the `viewports` map in `docsolace.config.yaml`. A capture step can set `highlight`, a locator for an element to outline in the screenshot.

## Mask

A mask redacts a volatile region, such as a timestamp or avatar, from the screenshot so it does not cause false "changed" results. Masks come from `defaultMask` in the config, which applies to every capture, plus a tour's own `mask` list.

## Drift check

The drift check decides whether a tour needs regenerating by comparing its screenshots, accessibility snapshots and the current contents of its `code_paths` against the last run. Pixel changes under `pixelDiffThreshold` do not count.

## Keep region

Text between `<!-- docsolace:keep -->` and `<!-- /docsolace:keep -->` in a generated page is human-owned and survives every regeneration.

## Auth profile

An auth profile in the config's `auth` section describes how to sign in so a tour can reach signed-in pages. A tour references one by name. The profile's credentials come from environment variables named by its `usernameEnv` and `passwordEnv` fields, and the session from a successful login is cached under the output directory's `.auth/` folder and reused.

## Seed

A seed is a named fixture, declared in the config's `seeds` map and referenced by a tour's `preconditions.seed`. A seed may declare a `command`, which only runs when `allowSeedCommands` is true.

## Product pages

Product pages describe the product itself rather than one UI flow: `overview`, `getting-started`, `concepts`, `configuration`, `troubleshooting`, `changelog` and `decisions`. They are grounded only in repository files and the tour inventory, never in the running app.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
