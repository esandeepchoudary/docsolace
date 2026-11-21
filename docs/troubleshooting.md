---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
description: "/plugin isn't recognized: your Claude Code install is out of date. Check it with claude --version, upgrade however you installed it, and restart. The plugin is…"
last_verified: "2026-11-21 (339898a)"
---

# Troubleshooting

## Plugin and install problems

`/plugin` isn't recognized: your Claude Code install is out of date. Check it with `claude --version`, upgrade however you installed it, and restart.

The plugin is installed but `/docsolace:document` doesn't show up: run `/reload-plugins`. If it is still missing, clear the cache, restart, and reinstall:

```bash
rm -rf ~/.claude/plugins/cache
```

Playwright asks for a password or `--with-deps` fails: some Linux setups need root to install system-level browser dependencies. If `npx playwright install --with-deps chromium` fails, try the browser-only form, which is usually enough:

```bash
npx playwright install chromium
```

## Capture problems

`capture` hangs or times out: check that the app it is supposed to screenshot is actually running. For the demo app that means `npm run dev` inside `demo-app/`, left running in its own terminal.

Port 5173 is already in use: something else is running the demo app, or a previous run did not shut down. Stop it first, or note the port Vite actually picked and adjust `baseUrl` in `docsolace.config.yaml` for that run.

Two runs produce different screenshot hashes for content that didn't change: something on the page is non-deterministic, such as a clock, an animation or live data. Mask it with `defaultMask` in `docsolace.config.yaml` or a tour's own `mask` list.

## Generation and session messages

"the prose ... is unchanged - it was written for the old captures": the screenshots or code changed but `doc-scribe` did not re-author that tour's paragraphs, so publishing would pair new images with old text. Re-run `/docsolace:document <tour-id>`. `--force` publishes the old prose anyway.

"is tracked by git" when saving a session: a `storageStatePath` inside a tracked file would be committed with live cookies. Run `git rm --cached` on it and add it to `.gitignore`, or choose another path.

## Keeping the plugin updated

New commits or a version bump do not reach an installed copy automatically, because third-party and local marketplaces have auto-update off by default. To pull in a newer version:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when the `version` field in `plugin/.claude-plugin/plugin.json` has been bumped since your install, because Claude Code caches by that string. To enable auto-update, open `/plugin`, go to the Marketplaces tab, select `docsolace-marketplace`, and choose Enable auto-update.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
