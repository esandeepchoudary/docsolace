---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "Claude Code; Node.js 22 or newer with npm; git; and the GitHub CLI (gh) for opening pull requests. The plugin installs its own dependencies (Playwright,…"
last_verified: "2026-11-21 (0cc9a45)"
---

# Getting started

## Prerequisites

Claude Code; Node.js 22 or newer with npm; git; and the GitHub CLI (`gh`) for opening pull requests. The plugin installs its own dependencies (Playwright, js-yaml, and others) into its own data directory on first use, never into your project.

## Install the plugin

Inside Claude Code, add the marketplace, install the plugin, and reload:

```
/plugin marketplace add esandeepchoudary/docsolace
/plugin install docsolace@docsolace-marketplace
/reload-plugins
```

From a local clone, pass its path instead: `/plugin marketplace add /path/to/docsolace`. The first session with the plugin active installs its dependencies and the Playwright browser, which takes about a minute and happens once. Check it with `/plugin list`.

## Run it

Open your project, start your app, and run:

```
/docsolace:document
```

The first run asks for your app's base URL and creates `docsolace.config.yaml` (annotated, with optional sections as commented examples), an empty `tours/` directory with a short `README.md`, a `.env.example`, and `.gitignore` entries for `.docsolace/artifacts/` and `.env`.

After that the same command adapts to its input. With no arguments it checks what you changed, re-captures covered tutorials, and asks once for a short description if UI changed that no tutorial covers. With plain words, such as `/docsolace:document the new billing page`, it drafts a tutorial for that feature. With a tour id, such as `/docsolace:document login`, it updates just that tutorial. Add `--review` to stop and ask at each step, or `--no-style` to skip design-skill detection.

## Update the plugin

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when the plugin's version number has changed, because Claude Code caches by it.

## Running without Claude Code

The pipeline is plain Node scripts. This repository bundles a small demo app (a login page and dashboard). In one terminal, install and start the demo app:

```bash
npm install
cp .env.example .env
cd demo-app && npm install
npm run dev
```

The demo app serves at `http://localhost:5173`; leave it running. In a second terminal at the repo root, capture and generate:

```bash
npm run capture -- --tour login
npm run generate-docs -- --tour login
cat docs/login.md
```

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
