---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "Claude Code is required. The pipeline is also plain Node scripts, and the README links to a \"Running it without Claude Code\" section in ADVANCED.md for that…"
last_verified: "2026-11-21 (339898a)"
---

# Getting started

## Prerequisites

Claude Code is required. The pipeline is also plain Node scripts, and the README links to a "Running it without Claude Code" section in `ADVANCED.md` for that route.

You also need Node.js 22 or later with npm, `git`, and the GitHub CLI (`gh`) for opening pull requests. The plugin installs its own dependencies (Playwright, js-yaml and others) into its own data directory on first use, never into your project.

## Install the plugin

The repository is also a Claude Code plugin marketplace with one plugin in it, so you do not need to clone it into your project. Inside Claude Code:

```
/plugin marketplace add esandeepchoudary/docsolace
/plugin install docsolace@docsolace-marketplace
/reload-plugins
```

From a local clone, use its path instead: `/plugin marketplace add /path/to/docsolace`.

The first session with the plugin active installs its dependencies and the Playwright browser, which takes about a minute and happens once. Check the install with `/plugin list`.

## Run it in your project

Start your app, open your project in Claude Code, and run:

```
/docsolace:document
```

The first run asks for your app's base URL and sets the project up. It creates `docsolace.config.yaml` (annotated, with each optional section as a commented example), a `tours/` directory with a short `README.md`, a `.env.example`, and `.gitignore` entries for `.docsolace/artifacts/` and `.env` so session cookies and credentials cannot be committed.

## Everyday commands

With no arguments, `/docsolace:document` checks what you changed. A covered tutorial is re-captured and updated. If UI changed that no tutorial covers, it asks once for a short description and drafts one.

Plain words draft a tutorial for that feature:

```
/docsolace:document the new billing page
```

A tour id updates just that tutorial:

```
/docsolace:document login
```

Add `--review` to any mode to stop and ask at each step instead of running autonomously, or `--no-style` to skip design-skill detection. The maintenance modes (`map`, `prune`, `product`, `validate`, `status`, `init-site`, and `propose <slug> "<description>"`) are listed under "All commands" in `ADVANCED.md`.

## Updating the plugin

To update an installed copy:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when the plugin's version number has changed, because Claude Code caches by it. Auto-update is off by default for third-party marketplaces.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
