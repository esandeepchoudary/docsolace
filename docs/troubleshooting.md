---
sidebar_position: 5
sidebar_label: "Troubleshooting"
title: "Troubleshooting"
---

# Troubleshooting

## Common install and runtime issues

If `/plugin` isn't recognized, the Claude Code install is out of date — check with `claude --version` and upgrade, then restart. If the plugin is installed but `/autodocs:document` doesn't show up, run `/reload-plugins`; if it's still missing, clear the cache (`rm -rf ~/.claude/plugins/cache`), restart, and reinstall. If `capture` hangs or times out, confirm the target app is actually running (e.g. `npm run dev` inside `demo-app/`, left running in its own terminal). If Playwright asks for a password or `npx playwright install --with-deps chromium` fails, some Linux setups need root for system-level browser dependencies — try `npx playwright install chromium` (browser only, no system deps) instead. If port 5173 is already in use, something else is already running the demo app (or a previous run didn't shut down) — stop it, or adjust `baseUrl` in `autodocs.config.yaml` to match whichever port was actually picked. If two runs produce different screenshot hashes for content that didn't actually change, something on the page is genuinely non-deterministic (a clock, an animation, live data) — mask it via `defaultMask` in `autodocs.config.yaml` or a tour's own `mask` list.

## Keeping the plugin updated

New commits to the repository (or a version bump) don't reach an already-installed copy automatically — third-party and local marketplaces have auto-update off by default, as a safety measure. Pull in a newer version with `/plugin marketplace update autodocs-marketplace` followed by `/reload-plugins`. Updates only actually land when `plugin/.claude-plugin/plugin.json`'s `version` field has been bumped since install, since Claude Code caches by that version string. Auto-update can instead be enabled from `/plugin` → Marketplaces → `autodocs-marketplace` → Enable auto-update.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
