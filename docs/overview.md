---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown…"
last_verified: "2026-11-21 (799ed0b)"
---

# Overview

## What it is

DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown documentation from what it captured. Each screenshot is paired with an accessibility snapshot, and the prose describes only what appears in that snapshot.

The generated Markdown lands in `docs/`. It can be read as-is or served through a bundled Docusaurus site scaffold.

## Who it's for

The README describes it as built for solo developers who document their own projects. The main workflow is one person running `/docsolace:document` when a feature is worth documenting. The README says each run ends with an opened docs PR for review, and that DocSolace never merges it.

## What it does

A tour is a YAML file describing the pages to visit, what to click, and where to take screenshots. DocSolace follows it against the running app at every configured viewport (desktop and mobile by default).

A drift check compares screenshots, accessibility snapshots and the contents of a tour's source `code_paths` against the last run. Unchanged tours are skipped, and pixel changes under `pixelDiffThreshold` are ignored. Text inside `<!-- docsolace:keep -->` blocks survives every regeneration.

Beyond tour pages, DocSolace can write product-level pages (overview, getting started, concepts, configuration, troubleshooting, changelog, decisions). These are grounded in repository files rather than the running app, and a page with nothing to ground it is skipped.

The confirmed tutorials in this project are "Dashboard overview" (what the main dashboard displays and how to read it), "Export dashboard activity" (exporting the current activity table as a CSV), and "Login page" (what a signed-out user sees before authenticating).

## Which models it uses

Three subagents do the LLM work, and the rest (capture, drift check, assembly, verification) is plain Node. `doc-scribe` writes one short paragraph per screenshot and uses Haiku. `product-scribe` writes the product pages and uses Sonnet. `tour-scout` explores the running app to draft a tour and uses Sonnet. Each model is set by the `model:` line in that agent's file under `plugin/agents/`.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
