---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "You need Claude Code, Node.js 22 or later with npm, git, and the GitHub CLI (gh) for opening PRs. The plugin installs its own dependencies (Playwright, js-yaml…"
last_verified: "2026-11-21 (799ed0b)"
---

# Getting started

## Prerequisites

You need Claude Code, Node.js 22 or later with npm, git, and the GitHub CLI (`gh`) for opening PRs. The plugin installs its own dependencies (Playwright, js-yaml and others) into its own data directory on first use, never into your project. The README also says the pipeline is plain Node scripts, so it can run without Claude Code; see `ADVANCED.md` for that.

## Install the plugin

This repository is also a Claude Code plugin marketplace with one plugin in it, so you do not need to clone it into your project. Inside Claude Code, run:

```
/plugin marketplace add esandeepchoudary/docsolace
/plugin install docsolace@docsolace-marketplace
/reload-plugins
```

From a local clone, pass its path instead: `/plugin marketplace add /path/to/docsolace`. The first session with the plugin active installs its dependencies and the Playwright browser, which takes about a minute and happens once. Check the install with `/plugin list`.

## Run it

Open your project, start your app, and run:

```
/docsolace:document
```

The first run asks for your app's base URL and sets the project up. It creates an annotated `docsolace.config.yaml`, an empty `tours/` directory with a short `README.md`, a `.env.example`, and `.gitignore` entries for `.docsolace/artifacts/` and `.env`.

After that the same command adapts to what you give it:

```
/docsolace:document the new billing page
/docsolace:document login
```

With no arguments it checks what you changed, re-captures covered tutorials, and offers to draft one for uncovered UI. With plain words it drafts a tutorial for that feature. With a tour id it updates only that tutorial.

## What a run produces

When a run has something to commit, it verifies image references and internal links under `docs/`, puts the `review-diffs` report in the PR body, stages only `docs/` and `tours/*.yaml`, and commits. It commits onto your current branch if that is `feat/*` or `fix/*`, and otherwise onto a new `docs/<slug>` branch, never straight to `main`. It then pushes and opens or updates the PR, and it never merges.

## Update the plugin

To pull in a newer version of an installed copy:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when the plugin's version number has changed, because Claude Code caches by it. Auto-update is off by default for third-party marketplaces.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
