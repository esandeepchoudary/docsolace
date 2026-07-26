# Advanced topics

Edge cases beyond the common path: uploads, forms, async waits, CAPTCHA,
non-password logins, third-party integrations, seed data, voice input,
mapping a whole app automatically, running without Claude Code, and CI.
Part of [AutoDocs](./README.md).

Not needed for the common path described in the main [README](./README.md) — reach for these when you hit the
specific case: uploading a file, filling out forms, waiting on async
content, CAPTCHA, a non-password login, a third-party integration, seed
data, voice input, mapping a whole app at once, running the pipeline without
Claude Code at all, or wiring up CI.

## Uploading a file

If a flow requires uploading a file — a CSV importer, an image, a sample
data file — before anything interesting shows up, use an `upload` step:

```yaml
steps:
  - action: goto
    path: /analyze
  - capture: upload-form
    description: "Empty upload form"
  - action: upload
    selector: "input[type='file']"
    file: fixtures/sample.csv
  - capture: analysis-result
    description: "Result view after uploading a sample file"
```

`file` must point at a project-committed file under `fixtures/<name>` (not
a secret — a small, deterministic sample the app can process the same way
every run); anything outside `fixtures/` is rejected. Unlike every other
selector in a tour, target the real `<input type="file">` element with a
CSS selector rather than a role locator — file inputs have no meaningful
accessible role for this, so CSS is the documented exception here.

Drafting via `/document propose`? If you didn't hand-author a fixture,
`tour-scout` will try to self-author a small one for simple, inferable
formats (CSV/JSON only when a shape is actually visible on the page,
plain text, or an image via a real screenshot) and verify the upload
actually succeeds before finalizing the step. For anything else — a
domain-specific or unknown binary format — it still stops and asks for a
real fixture, same as before. Either way, it's flagged in tour-scout's
report so you know to review it.

## Filling out forms and editing content

Use `fill` for standard inputs/textareas — it sets the value directly, fast
and deterministic:

```yaml
steps:
  - action: fill
    selector: "role=textbox[name='Full name']"
    value: "Ada Lovelace"
  - action: select
    selector: "role=combobox[name='Country']"
    value: "uk"
  - action: check
    selector: "role=checkbox[name='Subscribe to updates']"
    checked: true
  - action: click
    selector: "role=button[name='Save']"
```

Use `type` instead of `fill` only when `fill` genuinely doesn't work —
contenteditable rich-text editors, or a JS-driven autocomplete/
search-as-you-type widget that listens for real keystroke events rather than
a value change:

```yaml
- action: type
  selector: "[contenteditable='true']"
  value: "Meeting notes go here."
```

Never put a real credential in a `fill`/`type` step's `value` — for a login
form, use the [`auth` mechanism](./CONFIGURATION.md) instead; a tour's YAML is committed to
your repo, and a hardcoded password in it is a leaked password.

Drafting via `/document propose`? A form field starts empty, so when you
didn't give it a real value, `tour-scout` fills in an obviously-fake
placeholder inferred from the field's label — `user@example.com` for an
email field, a `555-01XX` number for phone, a generic non-notable name,
and so on (all flagged in its report). It will never auto-fill anything
that looks like an SSN, government ID, or payment card field, synthetic or
not — that's left for you to fill in yourself, same as a password field.

## Waiting for async content (e.g. an AI chat reply)

`fill`/`type`/`select`/`check`/`press`/`hover` don't wait for anything after
acting, so a `capture` placed right after one of them might run before an
async response has appeared. Add a `wait` step targeting a stable signal —
here, a chat UI whose "typing…" indicator disappears once the reply is
ready:

```yaml
steps:
  - action: fill
    selector: "role=textbox[name='Message']"
    value: "What's the weather like?"
  - action: press
    selector: "role=textbox[name='Message']"
    key: "Enter"
  - action: wait
    selector: "role=status[name='Typing indicator']"
    state: hidden
  - capture: chat-response
    description: "Assistant's reply to a weather question"
    mask:
      - "[data-testid='chat-message']"
```

Mask the response's actual text (`mask` above) — an AI-generated reply is
non-deterministic even once it's finished, so the tour can prove *that* a
response appeared without depending on its exact wording changing the
drift/pixel-diff result every run.

## CAPTCHA

AutoDocs doesn't attempt to solve, guess past, or script around a CAPTCHA —
that's a different kind of feature than "drive an app that trusts you," and
not one this project builds. If a flow you want documented is
CAPTCHA-gated, the realistic path is the same one this project already uses
for anything else too varied to script reliably (see OAuth/SSO below):
capture against a dev/staging environment where the app itself disables
CAPTCHA for testing, rather than trying to defeat it.

## If your app doesn't use a plain username/password login

The `auth` profile shape shown in `autodocs.config.yaml` — fill a username
field, fill a password field, click submit — only covers that one flow. For
OAuth, SSO, a magic link, 2FA, or anything else too varied to script
reliably, give the profile a `storageStatePath` instead:

```yaml
auth:
  oauth-user:
    storageStatePath: .autodocs/artifacts/.auth/oauth-user.manual.json
```

Then record a session for it once — this opens a real, visible browser
window, so it needs to run **in your own terminal**, not handed to Claude to
run: Claude's Bash tool has no display to show that browser window in, and
often no interactive stdin either — which matters for the next part. Ask
Claude what `${CLAUDE_PLUGIN_DATA}` resolves to for this session (it can
tell you without running the command itself), then run it yourself:

```bash
node "<the resolved path>/scripts/save-auth-state.mjs" --profile oauth-user
```

(Running the pipeline standalone instead? Use `node
plugin/scripts/save-auth-state.mjs --profile oauth-user`.)

By default it waits for you to log in and press Enter once you're done —
fine from your own terminal, since it's a real TTY. If you'd rather it
detect completion on its own (or you're running it somewhere without a
reliable stdin), pass `--wait-for "<url-pattern>"` — e.g. `--wait-for
"**/dashboard"` — and it saves the session automatically the moment the
browser navigates to a matching URL, no Enter needed. Without a real
terminal *and* without `--wait-for`, it refuses up front with a clear
message instead of hanging forever waiting for input that will never come.

Every tour whose `preconditions.auth` points at that profile reuses the
saved session directly — no scripted login is ever attempted for it.
Verified this really skips the scripted path, not just that it doesn't
error: ran it against a profile with none of the username/password fields
set at all.

## Third-party integrations (Slack, Google, Stripe, etc.)

A "Connect to Slack" button that pops open a real OAuth consent screen on
someone else's domain isn't something AutoDocs scripts through — same call
as CAPTCHA above, and for the same reasons: a third party's login/consent
UI changes without notice, can add MFA at any time, and automating it
starts to look like credential automation against a service you don't
control. `tour-scout` will stop and report if it hits one, rather than
attempting to click through it.

The fix is the same idea as OAuth/SSO login above, just applied to the
*integration's* connected state instead of the app's own session: connect
it once, out of band, in whatever environment you capture against (most
apps happily keep an integration connected indefinitely once it's set up),
then write the tour against the already-connected UI. There's nothing
AutoDocs-specific to configure for this — it's just making sure the
environment your tours run against already has the integration turned on
before you draft or capture anything that assumes it.

## Reproducible data with seeds

A tour's `preconditions.seed` names a fixture — declared under
`autodocs.config.yaml`'s `seeds` map — so a data-dependent flow captures
against the same data every run instead of whatever happens to be there.
Most apps don't need anything to actually *run*: static/demo data (like this
repo's own `demo-baseline`) just needs a `description` and capture treats it
as a no-op. If your app needs an actual reset/seed step, give the fixture a
`command`:

```yaml
seeds:
  demo-baseline:
    description: "Resets the app's database to a known fixture."
    command: "npm run db:seed -- --fixture=baseline"
```

That command **won't run** until you explicitly opt in with
`allowSeedCommands: true` in the config (or `--allow-seed-commands` on
`capture`) — off by default, on purpose: a seed's command is config, and
config is exactly as reachable by an unreviewed change as tour YAML is, so
running it should never be implied just because it's declared. With the gate
off, a tour naming a seed that has a command still captures fine — it just
skips the command and tells you so.

## Voice input

For an app with a microphone-driven feature (a "press to talk" button, a
voice command bar), a tour's `preconditions.voice` names a fixture audio
file under `fixtures/<name>.wav`, fed to the browser as a fake microphone:

```yaml
preconditions:
  voice: fixtures/sample-command.wav
steps:
  - action: goto
    path: /assistant
  - action: click
    selector: "role=button[name='Start recording']"
  - action: wait
    selector: "role=status[name='Transcript']"
    state: visible
  - capture: voice-result
    description: "Transcript shown after recording a sample voice command"
    mask:
      - "[data-testid='transcript-text']"
```

Unlike `upload`'s `file`, this is a **precondition**, not a per-step action
— it's resolved once, before the browser launches, because Chromium's
fake-microphone flags only take effect at launch time (they can't be
applied mid-page the way a locator action can). Mask the transcript's
actual text in the following capture, same as any AI-generated response —
see "Waiting for async content" above for why: speech-to-text output is
non-deterministic even when it's working correctly.

## Mapping a whole app automatically

`/autodocs:document map` discovers what to document instead of you naming
one feature at a time, via three complementary passes designed to actually
reach *every* feature, not just whatever's linked from the homepage:

1. an **authenticated discovery crawl** — once per configured `auth`
   profile, plus one signed-out pass — so admin-only and user-only features
   are both found, not just what an anonymous visitor can reach;
2. a **code review** of the app's own routing/source, which names every
   feature and its backing files, including ones no crawl pass happened to
   link to;
3. a **confirmation crawl** that directly visits every route the code review
   found, again under every profile, so a feature reachable only via
   in-app JS/button navigation (never a real `<a href>`) still gets probed.

These reconcile into a proposed feature list and doc structure, each entry
tagged with which role(s) actually reached it (or flagged if none did), then
dispatches `tour-scout` for every discovered gap. **By default** it drafts,
validates, confirms, generates, and ships all of them — same autonomous
behavior and hard stops as `propose` (see
["It ships a docs PR for you"](./README.md#it-ships-a-docs-pr-for-you) in the main README), just covering the whole app per invocation instead of one feature.
Append `--review` to get the previous behavior back: it asks which features
you want drafted before dispatching `tour-scout` for any of them, and stops
after each draft instead of confirming it.

```
node "${CLAUDE_PLUGIN_DATA}/scripts/crawl.mjs" --all-auth
```

By **default the crawl is read-only**: it navigates same-origin links and
records what it finds — page titles, and the buttons/forms/links present —
into `.autodocs/artifacts/site-map.json`, tagging each page with
`reachedBy: [...]` (which profile(s), or `"anonymous"`, reached it). It never
submits a form or clicks an action button in this mode. Bounded by
`crawl.maxPages` / `crawl.maxDepth` in config (defaults: 50 pages, depth 4)
so it can't run away on a large app, and it never follows a logout/sign-out
link (that would kill its own session mid-crawl) or leave the app's origin.

`--all-auth` runs one crawl pass per profile under `autodocs.config.yaml`'s
`auth` map, plus one signed-out pass, and merges them (unioning
`reachedBy`/affordances per route, keeping the shallowest depth any pass
found it at) — pass a single `--auth <profile>` instead for just one role, or
neither for the old signed-out-only default. **A profile whose session
hasn't been recorded yet is skipped, not fatal**: `crawl.mjs` reports exactly
which profile and why (missing credentials, or an unrecorded
`storageStatePath` — with the same `save-auth-state.mjs` hint capture.mjs
gives), and keeps crawling under every other profile so one missing role
never blocks mapping the rest of the app.

`--routes-file <path>` runs the **confirmation crawl**: instead of a
link-following BFS, it directly visits every site-relative route listed in
the given JSON array (one per line, e.g.
`["/", "/dashboard", "/admin/users"]`) — the route list `/document map`
writes to `.autodocs/artifacts/source-routes.json` after reading the app's
source. Combine it with `--max-depth 0` (no following links out from these
routes) and `--all-auth` to probe every source-declared route under every
role in one pass. A route that redirects to a login/error page under a given
profile is recorded landing there — the "gated for this role" signal, not a
crash. Every entry is validated as a site-relative path (`/foo`, never an
absolute or protocol-relative URL) before it's navigated to, the same guard a
tour's own `goto` step gets — this file is `/document map`-generated, not
hand-authored, so it's treated as untrusted input per this project's own
security conventions.

**Interactive mode** (`crawl.mjs --interactive`) additionally fills in and
submits forms with synthetic data, and clicks buttons, to reach states a
pure link-crawl can't reach on its own (e.g. a search results page). This
is **double opt-in, off by default** — it requires *both* the `--interactive`
flag *and* `crawl.allowInteractive: true` in `autodocs.config.yaml`, the
same shape as `allowSeedCommands` above, since a crawler that submits forms
on a real authenticated app can trigger real side effects (an email sent, a
support ticket filed) if pointed at anything but a throwaway/dev
environment. **Even with interactive mode on, it never touches a sensitive
field** (password, SSN, payment/card number, CVV, API key/token — the same
`isSensitiveField` check `tour-scout`'s own form-filling guidance uses) **or
clicks a destructive-sounding control** (delete, pay, send, log out, and
similar — `isDestructiveControl`) — those exclusions aren't something the
config flag can widen.

```yaml
crawl:
  maxPages: 50
  maxDepth: 4
  allowInteractive: false # only set true against a throwaway/dev environment
```

After both crawls, `/document map` reads the app's own routing/source to name
each feature and its backing files, cross-checks that against the merged
`site-map.json`, and writes `.autodocs/artifacts/doc-plan.md` — the
reconciled list (each feature's route, description, `code_paths`, and which
role(s) reached it, or a flag if none did) plus a suggested section
structure, and the audit trail for what gets drafted next (all of it, by
default; whatever you pick, under `--review`).

## Archiving a removed feature

Drift gating keeps docs in sync when a feature *changes*; this is the other
direction — what happens when a feature is *removed*. Without it, a tour for
a deleted page either goes stale silently or starts failing capture with a
confusing error the next time it runs.

`/document map` checks for this automatically (as part of its full
reconciliation), or run just this check on its own:

```
/autodocs:document prune
```

It flags a **confirmed** tour as an orphan candidate on two mechanical
signals — no guessing involved, and not treated as equally trustworthy:

- **`code-removed`** — the tour's `code_paths` used to resolve to real files
  (it was captured/generated successfully before) and no longer does. Checked
  against the committed git tree directly — exact, not a sample.
- **`route-unreachable`** — none of the tour's `goto` steps' paths turn up in
  a crawl or code-review pass (only checked when `/document map` has already
  produced `site-map.json`/`source-routes.json` to check against; `prune` on
  its own, with neither file present yet, checks `code-removed` only). A
  crawl is explicitly best-effort elsewhere in this project too (bounded by
  `maxPages`/`maxDepth`, a profile can be skipped) — an unreached route is a
  reason to look, not proof the feature is gone, so this signal **alone never
  triggers auto-archiving**, even in autonomous mode.

**By default it auto-archives only tours flagged `code-removed`** — same
autonomous-by-default posture as every other mode (see
["It ships a docs PR for you"](./README.md#it-ships-a-docs-pr-for-you) in the main README), but only where the evidence is exact — by flipping
`status: confirmed` to `status: archived` and moving the generated page (and
images) from `docs/<id>.md` to `docs/archive/<id>.md`, with a banner
explaining why. It's **never deleted**: `tours/<id>.yaml` and every word of
prose survive, just relocated, so a wrong call is a one-line revert — flip
`status` back to `confirmed` and move the page back. A `route-unreachable`-
only candidate is always just reported, for a human to check. Append
`--review` to list every candidate (both signals) and stop instead of
archiving anything.

`docs/archive/` gets its own `_category_.json`, so the scaffolded Docusaurus
site (see ["Publishing a docs site"](./PUBLISHING.md)) files every archived tutorial into
a dedicated **Archive** section at the bottom of the sidebar automatically —
nothing to configure by hand. An archived tour is permanently skipped by
`capture`/`drift`/`generate-docs`/`validate`, the same way `draft`/`proposed`
tours are — its feature is gone, so there's nothing left to capture.

## Running it without Claude Code

The plugin is the primary way to use AutoDocs, but the pipeline underneath
it is just plain Node scripts — nothing about it requires Claude Code. This
repo bundles a tiny demo app (a login page + dashboard) so you can see the
whole loop work without installing the plugin at all.

**Terminal 1** — install everything, then start the demo app and leave it running:

```bash
npm install
cp .env.example .env
cd demo-app && npm install
npm run dev              # http://localhost:5173 — leave this running
```

**Terminal 2** — back in the repo root, capture a real screenshot and turn it into a tutorial:

```bash
npm run capture -- --tour login
npm run generate-docs -- --tour login
cat docs/login.md        # <- look at what it wrote
```

That's the whole loop: a real screenshot went in, a grounded Markdown
tutorial came out.

Everyday commands, once you've got your own `autodocs.config.yaml` and
`tours/` (see ["Configuring tours and auth"](./CONFIGURATION.md)):

| Command | What it does |
|---|---|
| `npm run validate` | Preflight-check config/tours (undefined auth profiles, empty `code_paths` matches, non-role selectors) without launching a browser |
| `npm run capture -- --tour <id>` | Screenshot one tour, every configured viewport |
| `npm run capture -- --tour <id> --tour <id2> ...` / `npm run capture -- --all` | Screenshot several tours in one run: one shared browser, batched with bounded concurrency (`--concurrency <n>`, default 3 — a tour with `preconditions.seed` always runs alone, never concurrently with another tour). Each tour's failure is isolated from its siblings; exits non-zero if any tour failed |
| `npm run capture -- --tour <id> --continue-on-error` | Keep going after a step fails instead of aborting the whole tour — the resulting manifest is marked `partial` (only the captures that actually succeeded) and `generate-docs.mjs` refuses to render it until a clean re-capture succeeds. Still exits non-zero |
| `npm run drift` | Show which tours changed, without generating anything |
| `npm run status` | Report which tours/product pages are dirty, clean, or gated, and when each was last generated |
| `npm run generate-docs -- --tour <id>` | Write/update that tour's tutorial page (add `--force` to override an edit-outside-keep-region warning) |
| `npm run generate-product-docs` | Write/update the enabled product-level pages (overview/getting-started/concepts/configuration/troubleshooting/changelog) from `.autodocs/artifacts/prose/_product.json` (written by the `product-scribe` subagent) |
| `npm run prune` | Flag confirmed tours whose feature looks removed from the app (see "Archiving a removed feature") |
| `npm run archive-tour -- --tour <id>` | Archive one tour: flip its status, move its page under `docs/archive/` |
| `npm run verify-docs` | Check every image reference and internal link/anchor under `docs/` resolves (add `--build` to also build `site/`) — run before a docs PR opens |
| `npm run review-diffs` | Render a before/after/diff report for any screenshot about to be replaced — open `.autodocs/artifacts/diff-report.html` |
| `npm test` | Run the unit test suite (for anyone changing AutoDocs itself, not required to just use it) |

These are the exact same scripts `/autodocs:document` calls under the hood —
see ["Developing on the plugin itself"](./CONTRIBUTING.md#developing-on-the-plugin-itself).

## CI (optional, off by default)

`.github/workflows/docs.yml` can run the whole pipeline in GitHub Actions
and open a PR with anything that changed, but it's parked on manual trigger
(`workflow_dispatch`) rather than firing automatically — this is a
solo-developer tool, so running things yourself is the default, not
something to set up before you can use AutoDocs. If you ever want it
automatic (e.g. on every merge to `main`), the job is ready; you'd flip its
`on:` trigger and set an `ANTHROPIC_API_KEY` repo secret.

