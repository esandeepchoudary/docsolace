---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
description: "If /plugin isn't recognized, the Claude Code install is out of date — check with claude --version, upgrade, and restart. If the plugin's installed but…"
---

# Troubleshooting

## Common install/runtime issues

If /plugin isn't recognized, the Claude Code install is out of date — check with claude --version, upgrade, and restart. If the plugin's installed but /docsolace:document doesn't show up, run /reload-plugins; if it's still missing, clear the cache (rm -rf ~/.claude/plugins/cache), restart, and reinstall. If capture hangs or times out, check whether the app it's supposed to screenshot is actually running (for the demo app, that's npm run dev inside demo-app/, left running in its own terminal). If Playwright asks for a password or --with-deps fails, some Linux setups need root to install system-level browser dependencies — try npx playwright install chromium (browser only, no system deps) instead of the --with-deps variant. If port 5173 is already in use, something else is running the demo app (or a previous run didn't shut down) — stop it, or adjust baseUrl in docsolace.config.yaml to whichever port Vite actually picked. If two runs produce different screenshot hashes for content that "didn't change," something on the page is genuinely non-deterministic (a clock, an animation, live data) — mask it via defaultMask in docsolace.config.yaml or a tour's own mask list.

## Keeping the plugin updated

New commits to this repo, or a version bump, don't reach an already-installed copy automatically — third-party and local marketplaces like this one have auto-update off by default, as a safety default rather than a bug. To pull in a newer version, run /plugin marketplace update docsolace-marketplace followed by /reload-plugins. Updates only actually land once plugin/.claude-plugin/plugin.json's version field has been bumped since the install, since Claude Code caches by that version string — new commits alone don't count. Auto-update for this marketplace can instead be enabled from /plugin, under the Marketplaces tab, by selecting docsolace-marketplace and choosing Enable auto-update.

<!-- docsolace:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /docsolace:keep -->
