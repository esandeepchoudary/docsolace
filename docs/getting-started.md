---
sidebar_position: 2
sidebar_label: "Getting started"
title: "Getting started"
---

# Getting started

## Prerequisites

Node.js 22+ and npm (built and tested against Node 22.21.1) and git. Using the plugin form additionally requires Claude Code installed and logged in; once the plugin is installed, it installs its own runtime dependencies (Playwright, js-yaml, and others) into its own data directory on first use, never into the target project's node_modules. Running the pipeline without Claude Code only requires Node.js and npm, installing dependencies directly into this project's own node_modules instead.

## Install and run as a Claude Code plugin

Inside Claude Code: `/plugin marketplace add esandeepchoudary/autodocs`, then `/plugin install autodocs@autodocs-marketplace`, then `/reload-plugins` (or restart Claude Code) to activate it — `/plugin list` should show `autodocs@autodocs-marketplace` enabled. In the project to document, run `/autodocs:document`; the first run bootstraps the project by asking for the app's local base URL and writing a starter `autodocs.config.yaml` and an empty `tours/` directory. Once a feature is worth documenting, `/autodocs:document propose <slug> "<description>"` drafts a tour by driving the app and, by default, carries it through to an opened docs PR.

## Run the pipeline without Claude Code

This repository bundles a small demo app (a login page and dashboard) to demonstrate the loop directly. In one terminal: `npm install`, `cp .env.example .env`, then `cd demo-app && npm install` and `npm run dev` (serves at http://localhost:5173, left running). In a second terminal, from the repo root: `npm run capture -- --tour login` followed by `npm run generate-docs -- --tour login`, then inspect the result with `cat docs/login.md`. Other everyday commands include `npm run validate` (preflight-checks config/tours without a browser), `npm run drift` (shows which tours changed without generating anything), `npm run status` (reports which tours/product pages are dirty, clean, or gated), `npm run generate-product-docs` (writes the enabled product-level pages from the product-scribe subagent's output), `npm run verify-docs` (checks every image reference and internal link/anchor under docs/ before a PR opens), `npm run review-diffs` (renders a before/after/diff report for screenshot changes), and `npm test` (runs the unit test suite).

## Configuration and environment variables

Project configuration lives in `autodocs.config.yaml`: `baseUrl` (the app's local URL), a `viewports` map (this repository's own config captures at a 1280x800 desktop size and a 390x844 mobile size), `outputDir` for pipeline artifacts, `defaultMask` for volatile regions to redact from every capture (this repository masks `.timestamp` and `.user-avatar`), `runTrigger` (informational cadence setting, default `manual-only`), `pixelDiffThreshold` (fraction of changed pixels before a screenshot is replaced, `0.005` in this repository), an `auth` map of login profiles, and a `seeds` map of named data fixtures. `.env.example` documents the environment variables an auth profile's `usernameEnv`/`passwordEnv` fields reference — for this repository's `standard-user` profile, that's `AUTODOCS_STANDARD_USER_USERNAME` and `AUTODOCS_STANDARD_USER_PASSWORD`; copy `.env.example` to `.env` and fill in real values, and never commit `.env` itself.

## Publishing a docs site

The fastest path to a published site is `/autodocs:document init-site`, which scaffolds a Docusaurus site that reads the project's `docs/` folder directly with no content duplication. From the scaffolded `site/` directory, `npm install` then `npm start` runs a dev server with live reload, and `npm run build` produces a static build under `site/build/` — it doesn't publish anywhere on its own. From there the build can be deployed to GitHub Pages (via Docusaurus's own `npm run deploy`, after setting `url`/`baseUrl`/`organizationName`/`projectName` in `site/docusaurus.config.js`) or to Netlify/Vercel by pointing their dashboards at the build command `cd site && npm install && npm run build` and publish directory `site/build`. Search is built in via `@easyops-cn/docusaurus-search-local`, indexed at build time with no external account or API key required.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
