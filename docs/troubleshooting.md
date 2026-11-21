---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
description: "If /plugin isn't recognized, your Claude Code install is out of date. Check with claude --version, upgrade it however you installed it, and restart. If the…"
last_verified: "2026-11-21 (799ed0b)"
---

# Troubleshooting

## Plugin commands are missing

If `/plugin` isn't recognized, your Claude Code install is out of date. Check with `claude --version`, upgrade it however you installed it, and restart.

If the plugin is installed but `/docsolace:document` doesn't show up, run `/reload-plugins`. If it is still missing, clear the cache, restart, and reinstall:

```bash
rm -rf ~/.claude/plugins/cache
```

## Capture hangs or times out

Check that the app being screenshotted is actually running.

## Playwright asks for a password or --with-deps fails

Some Linux setups need root to install system-level browser dependencies. If the first command below fails, try the second, which installs the browser only. That is usually enough.

```bash
npx playwright install --with-deps chromium
npx playwright install chromium
```

## Port 5173 already in use

Something else is already running the demo app, or a previous run didn't shut down. Stop it first, or note which port Vite actually picked and adjust `baseUrl` in `docsolace.config.yaml` for that run.

## Screenshot hashes differ for content that didn't change

Something on the page is non-deterministic, such as a clock, an animation or live data. Mask it, using `defaultMask` in `docsolace.config.yaml` or a tour's own `mask` list.

## "the prose ... is unchanged — it was written for the old captures"

The screenshots or code changed, but `doc-scribe` didn't re-author this tour's paragraphs, so publishing would pair new images with old text. Re-run `/docsolace:document <tour-id>`. Using `--force` publishes the old prose anyway.

## "is tracked by git" when saving a session

A `storageStatePath` inside a tracked file would be committed with live cookies. Run `git rm --cached` on it and add it to `.gitignore`, or choose another path.

## The plugin doesn't update

New commits don't reach an already-installed copy automatically, and third-party and local marketplaces have auto-update off by default. Run:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when `version` in `plugin/.claude-plugin/plugin.json` has been bumped since your install. To enable auto-update, open `/plugin`, go to the Marketplaces tab, select `docsolace-marketplace`, and choose Enable auto-update.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
