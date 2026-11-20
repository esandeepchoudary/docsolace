---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
description: "/plugin is not recognized: your Claude Code install is out of date. Check with claude --version, upgrade however you installed it, then restart. The plugin is…"
last_verified: "2026-11-20 (7943237)"
---

# Troubleshooting

## Common issues

`/plugin` is not recognized: your Claude Code install is out of date. Check with `claude --version`, upgrade however you installed it, then restart.

The plugin is installed but `/docsolace:document` does not show up: run `/reload-plugins`. If it is still missing, clear the cache with `rm -rf ~/.claude/plugins/cache`, restart, and reinstall.

`capture` hangs or times out: check that the app it is meant to screenshot is actually running.

Playwright asks for a password, or `--with-deps` fails: some Linux setups need root to install system-level browser dependencies. If `npx playwright install --with-deps chromium` fails, try `npx playwright install chromium`, which installs the browser only and is usually enough.

Port 5173 is already in use: something else is already running the demo app, or a previous run did not shut down. Stop it first, or note which port Vite actually picked and adjust `baseUrl` in `docsolace.config.yaml` for that run.

Two runs produce different screenshot hashes for content that did not change: something on the page is non-deterministic, such as a clock, an animation or live data. Mask it with `defaultMask` in `docsolace.config.yaml` or a tour's own `mask` list.

## Keeping the plugin updated

New commits or a version bump do not reach an already-installed copy automatically, because third-party and local marketplaces have auto-update off by default. To pull in a newer version:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when `plugin/.claude-plugin/plugin.json`'s `version` field has been bumped since your install, because Claude Code caches by that version string. To enable auto-update, open `/plugin`, go to the Marketplaces tab, select `docsolace-marketplace`, and choose Enable auto-update.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
