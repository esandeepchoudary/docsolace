# Troubleshooting DocSolace

Common install/runtime issues, and how to pull in a newer plugin version.
Part of [DocSolace](./README.md).

- **`/plugin` isn't recognized** — your Claude Code install is out of date;
  check with `claude --version` and upgrade however you installed it, then
  restart.
- **Plugin's installed but `/docsolace:document` doesn't show up** — run
  `/reload-plugins`. Still missing? Clear the cache
  (`rm -rf ~/.claude/plugins/cache`), restart, and reinstall.
- **`capture` hangs or times out** — is the app it's supposed to screenshot
  actually running? (In the "Running it without Claude Code" example under
  ["Advanced topics"](./ADVANCED.md), that's `npm run dev` inside `demo-app/`, left
  running in its own terminal.)
- **Playwright asks for a password / `--with-deps` fails** — some Linux
  setups need root to install system-level browser dependencies. If
  `npx playwright install --with-deps chromium` fails, try
  `npx playwright install chromium` (browser only, no system deps) — that's
  usually enough.
- **Port 5173 already in use** — something else is already running the demo
  app (or a previous run didn't shut down); stop it first, or note whichever
  port Vite actually picked and adjust `baseUrl` in `docsolace.config.yaml`
  for that run.
- **Two runs produce different screenshot hashes for content that "didn't
  change"** — something on the page is genuinely non-deterministic (a
  clock, an animation, live data). Mask it — see `defaultMask` in
  `docsolace.config.yaml` or a tour's own `mask` list.


## Keeping the plugin updated

New commits to this repo (or a version bump) don't reach an
already-installed copy automatically. Third-party and local marketplaces
(like this one) have auto-update **off** by default — that's a safety
default, not a bug. To pull in a newer version:

```
/plugin marketplace update docsolace-marketplace
/reload-plugins
```

Updates only actually land when `plugin/.claude-plugin/plugin.json`'s
`version` field has been bumped since your install — Claude Code caches by
that version string, so new commits alone don't count. If you'd rather not
update by hand, enable auto-update for this marketplace from `/plugin` →
the **Marketplaces** tab → select `docsolace-marketplace` → **Enable
auto-update**.

