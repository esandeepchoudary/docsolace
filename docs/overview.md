---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "DocSolace is a Claude Code plugin. It drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown…"
last_verified: "2026-11-20 (7943237)"
---

# Overview

## What it is

DocSolace is a Claude Code plugin. It drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown from what it actually saw. Each screenshot is paired with an accessibility snapshot, and the prose is grounded in that snapshot only, so an element that is not in the snapshot is not described.

The generated Markdown lands in `docs/`. It can be read as-is or published through a bundled Docusaurus scaffold, which serves `docs/` with search.

## Who it's for

Solo developers documenting their own projects. The primary workflow is one person running `/docsolace:document` when a feature is worth documenting. A GitHub Actions workflow exists in the repository, but it is parked on manual trigger and is optional.

## What it does

It follows a YAML tour against your real app, with no fixtures or mockups. It runs a drift check that compares screenshots and source `code_paths` against the last run, so only tutorials that changed are regenerated. Text inside `<!-- docsolace:keep -->` blocks survives every regeneration.

Each run ends with an opened docs pull request for you to review. It never merges.

It also writes product-level pages (overview, getting started, concepts, configuration, troubleshooting, changelog, decisions) from repository files only, never from the running app. A page with nothing to ground it is skipped and reported.

The pipeline underneath the plugin is plain Node scripts, so it can also be run without Claude Code. The repository bundles a small demo app (a login page and a dashboard) for trying this.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
