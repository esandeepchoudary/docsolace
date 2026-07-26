---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
description: "Claude Code, installed and logged in per its own docs (the underlying pipeline is also plain Node scripts runnable from a terminal without Claude Code at all).…"
---

# Getting started

## Prerequisites

Claude Code, installed and logged in per its own docs (the underlying pipeline is also plain Node scripts runnable from a terminal without Claude Code at all). Node.js 22+ and npm — built and tested against Node 22.21.1, with nothing relying on anything newer. Once the plugin is installed it installs its own runtime dependencies (Playwright, js-yaml, and others) into its own data directory on first use, never into the target project's node_modules. git is also required.

## Install the plugin

Inside Claude Code, add this repo as a plugin marketplace and install the plugin from it:

/plugin marketplace add esandeepchoudary/autodocs
/plugin install autodocs@autodocs-marketplace
/reload-plugins

(Working from a local clone instead of GitHub shorthand: use `/plugin marketplace add /path/to/autodocs`.) The first time a session starts with the plugin active, a SessionStart hook installs the plugin's own runtime dependencies and the Playwright browser into a private data directory — this can take a minute the first time (browser download) and is instant afterward. Verify the install with `/plugin list`, which should show `autodocs@autodocs-marketplace` enabled.

## Use it in a project

Open Claude Code in the project to document and run `/autodocs:document` (namespaced; plain `/document` may also resolve if unambiguous). The first time, it notices there's no autodocs.config.yaml yet, asks for the app's local base URL, and bootstraps the project: a real, annotated autodocs.config.yaml with every optional section included as commented-out examples, an empty tours/ directory with a short tours/README.md, a .env.example, and it adds .autodocs/artifacts/ and .env to the project's .gitignore automatically so session cookies and credentials never get committed. It then reports there's nothing to generate until a tour exists. From there, `/autodocs:document propose <slug> "<description>"` drafts a tour for a feature just built (via the tour-scout subagent) and, by default, carries it all the way through to an opened docs PR.

## Running it without Claude Code

The pipeline underneath the plugin is plain Node scripts; this repo bundles a small demo app (a login page plus a dashboard) to demonstrate the loop directly. In one terminal: `npm install`, `cp .env.example .env`, `cd demo-app && npm install`, then `npm run dev` (serves the demo app at http://localhost:5173, left running). In a second terminal, from the repo root: `npm run capture -- --tour login` followed by `npm run generate-docs -- --tour login`, then `cat docs/login.md` to see the generated tutorial. Everyday commands once a project has its own autodocs.config.yaml and tours/ include `npm run validate` (preflight-checks config/tours without a browser), `npm run capture -- --tour <id>`, `npm run drift`, `npm run status`, `npm run generate-docs -- --tour <id>`, `npm run generate-product-docs`, `npm run prune`, `npm run archive-tour -- --tour <id>`, `npm run verify-docs`, and `npm run review-diffs`.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
