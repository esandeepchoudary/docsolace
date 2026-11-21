---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
description: "DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown…"
last_verified: "2026-11-21 (339898a)"
---

# Overview

## What it is

DocSolace is a Claude Code plugin that drives a running web app in a headless browser with Playwright, takes screenshots, and writes tutorial-style Markdown documentation from what it actually saw. Each screenshot is paired with an accessibility snapshot, and the prose is written only from that snapshot, so nothing that is absent from it gets described.

The pipeline only regenerates what changed. A drift check compares screenshots and the source files a tour lists in `code_paths` against the last run, and skips tours that are unchanged.

## Who it's for

Solo developers documenting their own projects. The README describes it as screenshot-driven and docs-as-code, built for solo developers.

## What it does

Playwright follows a YAML "tour" against the real running app, with no fixtures or mockups. Captures are taken at every configured viewport (desktop and mobile by default). Text inside `<!-- docsolace:keep -->` blocks survives every regeneration. The Markdown lands in `docs/`, and a bundled Docusaurus scaffold can serve it as a site with search.

A run ends with an opened docs pull request for review. DocSolace never merges it.

Besides tutorial pages for individual features, it can write up to seven product-level pages (overview, getting started, concepts, configuration, troubleshooting, changelog, decisions) grounded only in repository files, never in the running app.

Three subagents do the language-model work: `doc-scribe` (one short paragraph per screenshot, Haiku), `product-scribe` (product pages, Sonnet) and `tour-scout` (explores the running app and drafts a tour, Sonnet). Capture, drift checking, assembly and verification are plain Node scripts.

This project currently documents three tours: Dashboard overview (what the main dashboard displays and how to read it), Export dashboard activity (exporting the current activity table as a CSV), and Login page (what a signed-out user sees before authenticating).

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
