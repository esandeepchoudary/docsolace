---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "Claude Code; Node.js 22 or newer with npm; git; and the GitHub CLI (gh) for opening pull requests. The plugin installs its own dependencies (Playwright,…"
last_verified: "2026-11-21 (dd8f119)"
---

# Getting started

## Prerequisites

Claude Code; Node.js 22 or newer with npm; git; and the GitHub CLI (`gh`) for opening pull requests. The plugin installs its own dependencies (Playwright, js-yaml and others) into its own data directory on first use, never into your project. The README also notes the pipeline is plain Node scripts and can be run without Claude Code; see `ADVANCED.md` for that.

## Install the plugin

Inside Claude Code, add the marketplace, install the plugin, and reload:

```
/plugin marketplace add esandeepchoudary/docsolace
/plugin install docsolace@docsolace-marketplace
/reload-plugins
```

From a local clone, use its path instead: `/plugin marketplace add /path/to/docsolace`. The first session with the plugin active installs its dependencies and the Playwright browser, which takes about a minute and happens once. Check the install with `/plugin list`.

## Run it

Open your project, start your app, and run:

```
/docsolace:document
```

The first run asks for your app's base URL and sets the project up, creating `docsolace.config.yaml`, a `tours/` directory with a short `README.md`, a `.env.example`, and `.gitignore` entries for `.docsolace/artifacts/` and `.env`.

After that the same command adapts to its input. With no arguments it checks what you changed: a tutorial covering the change is re-captured and updated, and if UI changed that no tutorial covers, it asks once for a short description and drafts one. With plain words, such as `/docsolace:document the new billing page`, it drafts a tutorial for that feature. With a tour id, such as `/docsolace:document login`, it updates just that tutorial.

Each run ends with an opened docs PR for you to review. It never merges.

## Update the plugin

To update an installed copy:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when the plugin's version number has changed, because Claude Code caches by it. Auto-update is off by default for third-party marketplaces; it can be enabled from `/plugin`, in the Marketplaces tab, by selecting `docsolace-marketplace` and choosing Enable auto-update.

## Optional flags and other modes

Add `--review` to any mode to stop and ask at each step instead of running autonomously, or `--no-style` to skip design-skill detection. The maintenance modes (`map`, `prune`, `product`, `validate`, `status`, `init-site`, and explicit `propose <slug> "<description>"`) are listed in `ADVANCED.md`. A run stops and asks only at a few hard stops: the feature couldn't be grounded in the app, a voice flow (always reported unverified), a `validate` error, an auth session that needs a human at a headed browser, or a hand-edited docs page outside its keep-region.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
