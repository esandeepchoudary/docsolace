---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "AutoDocs is a Claude Code plugin that drives a running web app with Playwright, takes screenshots, and writes tutorial-style Markdown documentation that stays…"
---

# Overview

## What it is

AutoDocs is a Claude Code plugin that drives a running web app with Playwright, takes screenshots, and writes tutorial-style Markdown documentation that stays in sync as the app changes. Instead of a person clicking through an app, taking screenshots, and writing "here's how the dashboard works" prose that goes stale the moment the UI changes, AutoDocs drives a real headless browser against the app's actual running instance, takes the screenshots itself, and writes grounded, tutorial-style docs from what it actually saw. It ships as a Claude Code plugin, which is its primary way of being used, and this repository also doubles as a private Claude Code plugin marketplace containing that one plugin.

## Who it's for

AutoDocs is built for solo developers: one person runs it themselves whenever a feature is worth documenting, rather than a team-scale pipeline that regenerates docs on every merge. The bundled CI workflow (.github/workflows/docs.yml) reflects this — it exists and can run the full pipeline, but is deliberately parked on manual trigger (workflow_dispatch) instead of firing automatically, because running things yourself is the default posture, not something to set up before using the tool.

## What it does

It drives a real running app headlessly: a declarative YAML "tour" describes a feature walk, and Playwright clicks through the actual app — no fixtures, no hand-authored mockups. Every screenshot is captured together with an accessibility snapshot of the page at that moment, and that snapshot becomes the grounding for any prose written about it, so nothing is invented. A drift check compares a fresh capture's screenshots and the tour's underlying source (code_paths) against the last run, so regeneration only touches tours that actually changed. Hand-written content inside `<!-- autodocs:keep --> ... <!-- /autodocs:keep -->` blocks survives every regeneration untouched. Generated output lands in docs/, staged and pushed as a pull request for a human to review and merge — it is never merged automatically. The generated docs/ folder can be served as a real docs site through a bundled Docusaurus scaffold, with built-in local search.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
