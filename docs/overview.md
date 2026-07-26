---
sidebar_position: 1
sidebar_label: "Overview"
title: "Overview"
---

# Overview

## What it is

AutoDocs writes and maintains an app's tutorials by actually using the app. Instead of a person clicking through the UI, taking screenshots, and writing prose that goes stale the moment the UI changes, AutoDocs drives a real headless browser against a running app, takes the screenshots itself, and writes tutorial-style documentation grounded in what it actually observed on the page. It ships primarily as a Claude Code plugin, installed from this repository acting as its own private plugin marketplace, and its underlying pipeline is also a set of plain Node scripts that can be run directly without Claude Code at all.

## Who it's for

It is built for solo developers documenting their own projects: one person runs it themselves whenever a feature is worth documenting, rather than a team-scale pipeline that regenerates docs automatically on every merge. Consistent with that, the optional GitHub Actions workflow for CI is parked on a manual trigger (workflow_dispatch) rather than firing automatically.

## What it does

The pipeline runs in four stages. Capture drives a headless browser through a tour (a YAML file describing pages to visit, actions to take, and where to screenshot) against the real running app, taking a screenshot and an accessibility snapshot at each capture point, at every configured viewport size. The drift check compares a new capture against the last one and, if a tour's screenshots and underlying source files are both unchanged, skips regenerating that tour's page. Generate writes tutorial prose for anything flagged as changed, grounded strictly in the accessibility snapshot captured in step one, and preserves any hand-written content inside an `<!-- autodocs:keep -->` region across regenerations. Publish is the resulting Markdown under `docs/`, viewable as-is or served through an optional scaffolded Docusaurus site. The same capture-to-generate shape (minus the browser-driven capture step) also produces this smaller set of product-level pages, grounded in the repository's own README, package.json, .env.example, autodocs.config.yaml, the companion CONFIGURATION.md/PUBLISHING.md/TROUBLESHOOTING.md/ADVANCED.md/CONTRIBUTING.md pages, and the confirmed tour inventory rather than the running app.

## Tutorials

- [Dashboard overview](dashboard-overview.md) — Show a new user what the main dashboard displays and how to read it.
- [Export dashboard activity](dashboard-export.md) — Show how to export the current activity table as a CSV.
- [Login page](login.md) — Show what a signed-out user sees before authenticating.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
