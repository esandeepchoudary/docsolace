---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown…"
last_verified: "2026-11-21 (0cc9a45)"
---

# Overview

## What it is

DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown from what it captured. Each screenshot is paired with an accessibility snapshot, and the prose describes only what appears in that snapshot.

The generated Markdown lands in `docs/`, where it can be read as-is or published through a bundled Docusaurus site scaffold, which includes search. The plugin repository is also a Claude Code plugin marketplace containing this one plugin.

## Who it's for

The README describes it as built for solo developers who document their own projects. The normal workflow is one person running `/docsolace:document` when a feature is worth documenting. CI exists but is parked on manual dispatch.

## What it does

A tour is a YAML file describing pages to visit, what to click, and where to take screenshots. DocSolace runs it against the real app at every configured viewport (desktop and mobile by default). No fixtures or mockups are involved.

A drift check compares screenshots, accessibility snapshots, and the current contents of each tour's source `code_paths` against the last run, so unchanged tours are skipped. Pixel changes under `pixelDiffThreshold` are treated as rendering noise. Text inside `<!-- docsolace:keep -->` blocks survives every regeneration.

Each run ends with a docs pull request for review. It never merges. Only `docs/` and `tours/*.yaml` are staged, and the commit goes onto the current `feat/*` or `fix/*` branch, otherwise onto a new `docs/<slug>` branch, never straight to `main`.

Besides tour pages, it can write product-level pages (overview, getting-started, concepts, configuration, troubleshooting, changelog, decisions) grounded only in repository files and the tour inventory, never the running app.

## Models used

Three subagents do the language-model work: `doc-scribe` (one short paragraph per screenshot, Haiku), `product-scribe` (product pages from repo files, Sonnet), and `tour-scout` (explores the running app and drafts a tour, Sonnet). Capture, drift checking, assembly, and verification are plain Node scripts and use no tokens.

## Tutorials in this project

The project's own confirmed tours are: Login page (what a signed-out user sees before authenticating), Dashboard overview (what the main dashboard displays and how to read it), and Export dashboard activity (how to export the current activity table as a CSV).

## License

The README and `package.json` state the license as ISC.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
