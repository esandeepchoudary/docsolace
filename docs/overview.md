---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown…"
last_verified: "2026-11-21 (dd8f119)"
---

# Overview

## What it is

DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown from what it actually saw. Each screenshot is paired with an accessibility snapshot, and the prose is written only from that snapshot, so nothing absent from it gets described.

Generated Markdown lands in `docs/`. It can be read as-is or published through a bundled Docusaurus scaffold, which serves `docs/` with search.

## Who it's for

The README describes it as built for solo developers: one person running the plugin's command when a feature is worth documenting, in their own project.

## What it does

A drift check compares screenshots and the source files listed in a tour's `code_paths` against the last run, so only changed tours are regenerated. Text inside `<!-- docsolace:keep -->` blocks survives every regeneration. Each run ends with an opened docs pull request for review; it never merges.

Besides tutorial pages, it can write up to seven product-level pages (overview, getting-started, concepts, configuration, troubleshooting, changelog, decisions) grounded only in repository files. A page with nothing to ground it is skipped and reported rather than padded.

Three subagents do the language-model work: `doc-scribe` (Haiku) writes one short paragraph per screenshot, `product-scribe` (Sonnet) writes the product pages, and `tour-scout` (Sonnet) explores the running app and drafts a tour. Capture, drift checking, assembly and verification are plain Node scripts.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
