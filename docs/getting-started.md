---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "Claude Code, installed and logged in per its own docs (or the pipeline can be run directly with plain Node scripts instead, skipping Claude Code entirely).…"
last_verified: "2026-08-04 (370b5a3)"
---

# Getting started

## Prerequisites

Claude Code, installed and logged in per its own docs (or the pipeline can be run directly with plain Node scripts instead, skipping Claude Code entirely). Node.js 22+ and npm — built and tested against Node 22.21.1. Once the plugin is installed, it installs its own runtime dependencies (Playwright, `js-yaml`, etc.) into its own data directory on first use, never into the target project's `node_modules`. `git` is also required.

## Install the plugin

This repository doubles as a private Claude Code plugin marketplace with one plugin in it (`docsolace`). Inside Claude Code, add the marketplace and install the plugin:

```
/plugin marketplace add esandeepchoudary/docsolace
/plugin install docsolace@docsolace-marketplace
/reload-plugins
```

Working from a local clone instead of GitHub shorthand? Use a path, e.g. `/plugin marketplace add /path/to/docsolace`. Verify the install with `/plugin list`, which should show `docsolace@docsolace-marketplace` enabled.

The first time a session starts with the plugin active, a `SessionStart` hook installs the plugin's own runtime dependencies and the Playwright browser into a private data directory — this can take a minute the first time (browser download) and is instant on every session after.

## Use it in your project

Open Claude Code in the project to document and run `/docsolace:document` (the fully namespaced form; plain `/document` may also resolve if unambiguous). The first time, it notices there's no `docsolace.config.yaml` yet, asks for the app's local base URL, and bootstraps the project: a real, annotated `docsolace.config.yaml` (every optional section — `auth`, `defaultMask`, `seeds`, etc. — included as commented-out examples), an empty `tours/` directory with a short `tours/README.md`, a `.env.example`, and it adds `.docsolace/artifacts/` and `.env` to the project's `.gitignore` automatically so session cookies and credentials never end up committed. From there, once a tour exists:

```
/docsolace:document
```

runs the full pipeline over every tour and ships a docs pull request. To draft a new tour for a feature just built:

```
/docsolace:document propose <slug> "<description>"
```

This dispatches the `tour-scout` subagent to actually drive the app and draft the tour, then — by default — carries it through to an opened docs PR. Other modes include `/docsolace:document map` (discover every feature automatically and draft/ship tours for gaps), `/docsolace:document prune` (check for tours whose feature looks removed), `/docsolace:document product` (regenerate the product-level pages), `/docsolace:document validate` (preflight-check config/tours/product pages, no browser), and `/docsolace:document status` (report which tours/pages are dirty, clean, or gated). Append `--review` to any mode to fall back to stopping for review at each step instead of running autonomously, and `--no-style` to skip design-skill detection for a run.

## Running it without Claude Code

The pipeline underneath the plugin is plain Node scripts and doesn't require Claude Code. This repository bundles a small demo app (a login page and dashboard) to see the whole loop work standalone.

In one terminal, install everything and start the demo app:

```bash
npm install
cp .env.example .env
cd demo-app && npm install
npm run dev              # http://localhost:5173 — leave this running
```

In a second terminal, back in the repo root, capture a real screenshot and turn it into a tutorial:

```bash
npm run capture -- --tour login
npm run generate-docs -- --tour login
cat docs/login.md        # look at what it wrote
```

Other everyday commands once a project has its own `docsolace.config.yaml` and `tours/`: `npm run validate` (preflight-check config/tours without a browser), `npm run capture -- --tour <id>`, `npm run drift` (show which tours changed without generating anything), `npm run status`, `npm run generate-docs -- --tour <id>`, `npm run generate-product-docs` (write the enabled product-level pages), `npm run prune`, `npm run archive-tour -- --tour <id>`, `npm run verify-docs` (check every image reference and internal link/anchor resolves), `npm run review-diffs` (render a before/after/diff report for screenshot changes), and `npm test` (run the unit test suite, for anyone changing DocSolace itself).

## How the pipeline works

Four stages run in order, matching the `npm run` scripts above: capture (`npm run capture`) reads a tour and drives a headless browser through it against the running app, shooting every screenshot at each configured viewport along with an accessibility snapshot; drift check (`npm run drift`) compares the new capture against the last one and skips regeneration for anything unchanged; generate (`npm run generate-docs`) writes tutorial prose grounded only in the accessibility snapshot, never inventing UI, while preserving anything inside `<!-- docsolace:keep -->` blocks; and publish serves the resulting Markdown from a `docs/` folder directly, or through the bundled Docusaurus site.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
