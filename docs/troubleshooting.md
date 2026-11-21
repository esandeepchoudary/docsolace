---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
description: "If /plugin is not recognized, your Claude Code install is out of date. Check with claude --version, upgrade however you installed it, and restart. If the…"
last_verified: "2026-11-21 (0cc9a45)"
---

# Troubleshooting

## Plugin commands are not recognized

If `/plugin` is not recognized, your Claude Code install is out of date. Check with `claude --version`, upgrade however you installed it, and restart. If the plugin is installed but `/docsolace:document` does not show up, run `/reload-plugins`. If it is still missing, clear the cache, restart, and reinstall:

```bash
rm -rf ~/.claude/plugins/cache
```

## Capture hangs or times out

Check that the app being screenshotted is actually running. For the bundled demo app, that means `npm run dev` inside `demo-app/`, left running in its own terminal.

## Playwright asks for a password or --with-deps fails

Some Linux setups need root to install system-level browser dependencies. If this fails:

```bash
npx playwright install --with-deps chromium
```

try the browser-only install, which is usually enough:

```bash
npx playwright install chromium
```

## Port 5173 already in use

Something else is running the demo app, or a previous run did not shut down. Stop it first, or note the port Vite actually picked and adjust `baseUrl` in `docsolace.config.yaml` for that run.

## Different screenshot hashes for content that did not change

Something on the page is non-deterministic, such as a clock, an animation, or live data. Mask it with `defaultMask` in `docsolace.config.yaml` or a tour's own `mask` list.

## "the prose ... is unchanged — it was written for the old captures"

The screenshots or code changed but `doc-scribe` did not re-author the tour's paragraphs, so publishing would pair new images with old text. Re-run `/docsolace:document <tour-id>`. Passing `--force` publishes the old prose anyway.

## "is tracked by git" when saving a session

A `storageStatePath` inside a tracked file would be committed with live cookies. Run `git rm --cached` on it and add it to `.gitignore`, or choose another path.

## Keeping the plugin updated

New commits or a version bump do not reach an installed copy automatically. Third-party and local marketplaces have auto-update off by default. To pull in a newer version:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when `version` in `plugin/.claude-plugin/plugin.json` has been bumped since your install. To enable auto-update, open `/plugin`, go to the Marketplaces tab, select `docsolace-marketplace`, and choose Enable auto-update.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
