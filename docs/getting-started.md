---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "Claude Code; Node.js 22 or newer with npm; git; and the GitHub CLI (gh) for opening pull requests. The plugin installs its own dependencies (Playwright,…"
last_verified: "2026-11-20 (7943237)"
---

# Getting started

## Prerequisites

Claude Code; Node.js 22 or newer with npm; git; and the GitHub CLI (`gh`) for opening pull requests. The plugin installs its own dependencies (Playwright, js-yaml and others) into its own data directory on first use, never into your project.

## Install the plugin

Inside Claude Code, add the marketplace, install the plugin, and reload:

```
/plugin marketplace add esandeepchoudary/docsolace
/plugin install docsolace@docsolace-marketplace
/reload-plugins
```

From a local clone, use its path instead: `/plugin marketplace add /path/to/docsolace`. The first session with the plugin active installs its dependencies and the Playwright browser, which takes about a minute and happens once. Check the install with `/plugin list`. Updates arrive when the plugin's version changes: run `/plugin update`, then restart.

## Run it

Start your app, open your project in Claude Code, and run:

```
/docsolace:document
```

The first run asks for your app's base URL and sets the project up. It creates `docsolace.config.yaml` (annotated, with every optional section as a commented example), a `tours/` directory with a short `README.md`, and `.env.example`. It also adds `.gitignore` entries for `.docsolace/artifacts/` and `.env` so session cookies and credentials are not committed.

## Day-to-day commands

With no arguments, `/docsolace:document` checks what you changed. If a tutorial covers it, that tutorial is re-captured and updated. If UI changed that no tutorial covers, it asks once for a short description and drafts one.

With plain words, it drafts a tutorial for that feature:

```
/docsolace:document the new billing page
```

With a tour id, it updates just that tutorial:

```
/docsolace:document login
```

Add `--review` to any mode to stop and ask at each step instead of running autonomously, or `--no-style` to skip design-skill detection. The maintenance modes (`map`, `prune`, `product`, `validate`, `status`, `init-site`, and explicit `propose <slug> "<description>"`) are listed in the "All /document commands" section of the advanced topics page.

## What a run ships

Once a run has something to commit, it runs `verify-docs` (every image reference and internal link under `docs/` must resolve, or it stops), runs `review-diffs` and puts that report in the pull request body, and stages only `docs/` and `tours/*.yaml`. It commits onto your current branch if that is `feat/*` or `fix/*`, otherwise onto a new `docs/<slug>` branch, never straight to `main`. It then pushes and opens or updates the pull request, and never merges.

A run stops and asks only at a few hard stops: the feature could not be grounded in the app, a voice flow (always reported unverified), a `validate` error, an auth session that needs a human at a headed browser, or a hand-edited docs page outside its keep-region.

## Running without Claude Code

The repository's demo app can be used to try the pipeline as plain Node scripts. In one terminal, install and start the demo app and leave it running:

```bash
npm install
cp .env.example .env
cd demo-app && npm install
npm run dev
```

The demo app serves at `http://localhost:5173`. In a second terminal, from the repository root:

```bash
npm run capture -- --tour login
npm run generate-docs -- --tour login
cat docs/login.md
```

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
