---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "DocSolace is a Claude Code plugin that drives a running web app with Playwright, takes screenshots, and writes tutorial-style Markdown documentation that stays…"
---

# Overview

## What it is

DocSolace is a Claude Code plugin that drives a running web app with Playwright, takes screenshots, and writes tutorial-style Markdown documentation that stays in sync as the app changes. Instead of a human clicking through an app, taking screenshots, and writing prose that goes stale the moment the UI changes, DocSolace drives a real headless browser against the app's actual running instance, takes the screenshots itself, and writes grounded, tutorial-style docs from what it actually saw. It ships primarily as a Claude Code plugin, but the underlying pipeline is plain Node scripts that can also be run directly from a terminal without Claude Code at all.

## Who it's for

It's built for solo developers: one person runs it themselves whenever a feature is worth documenting, not a team-scale pipeline that fires automatically on every merge. The bundled CI workflow (`.github/workflows/docs.yml`) exists but is deliberately parked on manual dispatch rather than treated as a required step, reflecting that same solo-developer intent.

## What it does

It drives a real app headlessly — Playwright clicks through a declarative YAML "tour" against the app's actual running instance, with no fixtures or hand-authored mockups. Every screenshot is captured alongside an accessibility snapshot, which becomes the grounding for the generated prose so nothing is invented. A drift check compares screenshots and source code paths against the last run, so regeneration only touches tours that actually changed. Hand-written content inside `<!-- docsolace:keep -->` blocks survives every regeneration untouched. Output lands in a docs folder as a reviewable pull request that is never auto-merged, and a bundled Docusaurus scaffold can publish that folder as a real docs site with built-in search.

## Beyond individual tours

Tours describe individual UI flows. A separate, smaller set of product-level pages — overview, getting-started, concepts, configuration, troubleshooting, changelog, and decisions — describes the product as a whole, grounded strictly in the project's own README, `package.json`, `.env.example`, config file, changelog or git tags, any ADR files, and the confirmed tour inventory, never the running app.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
