---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
description: "/plugin isn't recognized: your Claude Code install is out of date. Check with claude --version, upgrade however you installed it, then restart. The plugin is…"
last_verified: "2026-11-21 (dd8f119)"
---

# Troubleshooting

## Common issues

`/plugin` isn't recognized: your Claude Code install is out of date. Check with `claude --version`, upgrade however you installed it, then restart.

The plugin is installed but `/docsolace:document` doesn't show up: run `/reload-plugins`. If it is still missing, clear the cache with `rm -rf ~/.claude/plugins/cache`, restart, and reinstall.

`capture` hangs or times out: check that the app being screenshotted is actually running.

Playwright asks for a password, or `--with-deps` fails: some Linux setups need root to install system-level browser dependencies. If `npx playwright install --with-deps chromium` fails, try `npx playwright install chromium`, which installs the browser only and is usually enough.

Port 5173 is already in use: something else is already running the demo app, or a previous run didn't shut down. Stop it first, or note the port Vite actually picked and adjust `baseUrl` in `docsolace.config.yaml` for that run.

Two runs produce different screenshot hashes for content that did not change: something on the page is non-deterministic, such as a clock, an animation, or live data. Mask it with `defaultMask` in `docsolace.config.yaml` or a tour's own `mask` list.

## Keeping the plugin updated

New commits to the repository don't reach an already-installed copy automatically, and auto-update is off by default for third-party and local marketplaces. To pull in a newer version:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only land when the `version` field in `plugin/.claude-plugin/plugin.json` has been bumped since your install.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
