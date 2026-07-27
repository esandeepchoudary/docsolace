# Configuring AutoDocs: tours, auth, layout, and product pages

How to set up `autodocs.config.yaml` and `tours/*.yaml`, style generated
pages, and control the product-level pages and sidebar. Part of
[AutoDocs](./README.md) — see the main README for install/quickstart.

## Configuring tours and auth

Two things to set up, both by example in this repo:

- **`autodocs.config.yaml`** — your app's `baseUrl`, the `viewports` to
  capture at, and (if pages need to be signed in) an `auth` profile. See the
  comments in this repo's own `autodocs.config.yaml` for every field.
- **`tours/*.yaml`** — one file per feature walk. `tours/login.yaml` is the
  simplest real example in this repo:

  ```yaml
  id: login
  title: "Login page"
  intent: "Show what a signed-out user sees before authenticating."
  maturity: stable      # draft = still churning, skipped until you flip it
  status: confirmed     # confirmed = ready to use; proposed = drafted, not yet reviewed;
                         # archived = feature looks removed — see ["Archiving a removed feature"](./ADVANCED.md#archiving-a-removed-feature)
  steps:
    - action: goto
      path: /login
    - capture: login-full
      description: "Login form, signed out"
  code_paths:            # source that, if it changes, means this tour is dirty
    - demo-app/src/pages/Login.jsx
    - demo-app/src/pages/Login.css
  ```

  `tours/dashboard.yaml` shows a fuller example: signing in, clicking things,
  and masking volatile content (timestamps, avatars) so it doesn't cause
  false "changed" results. Prefer role-based selectors
  (`role=button[name='...']`) over CSS — they're far less flaky.

  Every step's `action`, in one place:

  | action | fields | what it does |
  |---|---|---|
  | `goto` | `path` | Navigate to a site-relative path |
  | `click` | `selector` | Click an element |
  | `fill` | `selector`, `value` | Set a form input/textarea's value directly |
  | `type` | `selector`, `value` | Simulate real keystrokes — for contenteditable/rich-text editors and autocomplete widgets `fill` doesn't work on |
  | `select` | `selector`, `value` | Choose a `<select>` option |
  | `check` | `selector`, `checked` (optional, default `true`) | Set a checkbox/radio's checked state |
  | `press` | `selector`, `key` | Send a keyboard key (e.g. `Enter`, `Escape`) |
  | `hover` | `selector` | Hover to reveal tooltip/menu UI |
  | `upload` | `selector`, `file` | Upload a `fixtures/<name>` file — see ["Uploading a file"](./ADVANCED.md#uploading-a-file) |
  | `wait` | `selector`, `state` (`visible`\|`hidden`\|`attached`\|`detached`) | Wait for an element to reach a state before continuing — see ["Waiting for async content"](./ADVANCED.md#waiting-for-async-content-eg-an-ai-chat-reply) |
  | *(none)* | `capture`, `description` | Take a screenshot + accessibility snapshot at this point |

  `fill`/`type`/`select`/`check`/`press`/`hover` don't wait for anything
  after acting, unlike `goto`/`click`/`upload` — add an explicit `wait` step
  when something needs a moment to happen (see
  ["Waiting for async content"](./ADVANCED.md#waiting-for-async-content-eg-an-ai-chat-reply)).

  A capture step also takes an optional `highlight` field — a role=/text=
  locator (same convention as everywhere else) for the element that step is
  about. Outlined in the screenshot itself, so a reader sees exactly which
  button/field the step describes instead of a plain full-page shot:

  ```yaml
  - capture: export-button
    description: "Export CSV button visible on the dashboard"
    highlight: "role=button[name='Export CSV']"
  ```

  Checked fresh per viewport — an element visible at desktop but hidden
  behind a collapsed menu at mobile just means that viewport's screenshot has
  no highlight (a warning, not a failure). The outline color is a neutral
  default, overridable via `.autodocs/doc-style.json`'s `page.highlightColor`
  if a design skill supplies an accent color. Adding or changing a
  `highlight` changes that step's screenshot pixels like any other visual
  edit — it goes through the normal pixel-diff gate, so check
  `npm run review-diffs` before shipping.

  A tour also takes two optional top-level fields — `prerequisites` and
  `see_also`, both lists of other tour ids — that render as "Before you
  start"/"See also" link lists on the generated page:

  ```yaml
  id: dashboard-export
  prerequisites:
    - login              # rendered above the intent, linking to login.md
  see_also:
    - dashboard-overview  # rendered after the steps, linking to dashboard-overview.md
  ```

  Purely mechanical — the link text is the target tour's own `title`, no
  subagent involved, so there's nothing here that can hallucinate. `npm run
  validate` errors if an id doesn't match a real tour under `tours/`, and
  warns if it matches one that isn't published yet (`maturity: draft` or
  `status: proposed`/`archived`). Renaming, retitling, or archiving *any*
  tour re-renders every page that links to it automatically on the next run
  — no extra step needed.

### Page layout and design-skill styling

Every capture is shot at each viewport in `autodocs.config.yaml`'s
`viewports` map (see above). By default, only the first viewport's
screenshot renders inline in a generated page — every other viewport's
screenshot collapses into a `<details>`/`<summary>` block the reader can
expand, instead of stacking every viewport's full-page screenshot one after
another. `autodocs.config.yaml`'s optional `docs:` section controls which
viewport stays inline:

```yaml
docs:
  primaryViewport: desktop        # must name a key under `viewports`; default = first key
  collapseOtherViewports: true    # false restores the old flat, all-inline layout
  stampVerified: false            # true stamps each page's frontmatter with "last_verified: <date> (<commit>)"
```

`stampVerified` (opt-in, default off) writes the same date/commit
`npm run status`/`/document status` already reads out of `state.json` onto
the page itself, so a reader can see how fresh a tutorial is without leaving
it. It only advances when the page is actually regenerated — never on a run
where nothing changed, so it can't be used to prove "someone checked this
today," only "this is what changed and when." Flipping it re-renders every
existing page once, through the normal drift gate — no extra step needed.

Every generated page also always gets a `description` frontmatter field —
a tour's own `intent`, or product-scribe's own first section, mechanically
stripped of markdown and truncated (`lib/product.mjs`'s
`deriveMetaDescription`) — so each page's search/answer-engine meta
description is specific to that page instead of the site-wide `tagline`.
No config needed; omitted automatically if there's nothing to ground it in.

**Design-skill styling.** If your project has a design/brand skill installed
(under `.claude/skills/` or an installed plugin, project- or user-scoped —
e.g. a company brand-guide skill), `/document` auto-detects it before
generating docs and applies it to two places, presentation only — it never
touches what `doc-scribe` writes or which UI a tour describes:

- The scaffolded Docusaurus site's theme (`site/src/css/custom.css`,
  `site/docusaurus.config.js`'s `themeConfig` — colors, fonts, logo,
  favicon).
- A small set of page-layout knobs, distilled into a committed
  `.autodocs/doc-style.json`: the "Steps" heading text, per-viewport summary
  labels for the collapsed blocks above (e.g. "On your phone" instead of
  "Mobile view"), and whether each screenshot is wrapped in a
  `<figure class="autodocs-figure">` for the theme to style further.

No design skill installed (the common case) means nothing changes — plain,
unbranded docs, same as before this feature existed. Append `--no-style` to
any `/document` invocation to skip detection for that run regardless; just
re-run `/document init-site` to re-detect and re-apply after installing a
different skill or changing the existing one — it's idempotent, so running
it again on an already-scaffolded site refreshes styling instead of
refusing. A change to the `docs:` block or to `doc-style.json` automatically
re-renders every existing page on the next `/document` run — no `--force`
needed — because it changes each tour's render hash (part of what
`drift.mjs` checks), independent of that tour's own screenshots or code.

### Product pages and sidebar sections

Two more optional `autodocs.config.yaml` sections, both consumed by
`/document product` (and folded into the normal pipeline — see
["It also documents the product itself"](./README.md#it-also-documents-the-product-itself) in the main README):

```yaml
product:
  name: "My App"                                  # optional; defaults to package.json's name
  pages: [overview, getting-started, concepts,     # default: all seven — configuration/
    configuration, troubleshooting, changelog,     # troubleshooting/changelog/decisions just
    decisions]                                     # get skipped when there's nothing to
                                                    # ground them in
  sources:                                         # extra grounding files/globs, beyond the
    - "docs-src/**/*.md"                           # standing README/package.json/.env.example/
                                                    # autodocs.config.yaml/CHANGELOG.md/
                                                    # docs/adr/*.md set
docs:
  sections:                                        # groups tour pages in the generated sidebar
    - label: "Getting started"                     # (docs/_sidebar.autodocs.json); a tour named
      tours: [login]                               # in no section just sorts into one flat
    - label: "Dashboard"                            # "everything else" group instead
      tours: [dashboard-overview, dashboard-export]
```

Every tour page always gets a `sidebar_position` (the product pages pin
above them at 1–7) so the sidebar sorts deterministically even without
`docs.sections` — grouping into named categories is the opt-in part, not the
ordering. `product.sources` entries must be project-relative globs (no
absolute paths, no `..` segments) — `/document validate` warns if one
matches nothing, or if `docs.sections` names a tour that doesn't exist.
`product-scribe` never reads `.env`, key/credential files, or anything under
a `.auth/` directory, no matter what a glob would otherwise match.

The `decisions` page needs no config at all: drop one or more Architecture
Decision Record files under `docs/adr/*.md` and it's picked up automatically,
same zero-config detection as `CHANGELOG.md`. It's the one page where
`product-scribe` is allowed to describe *why* something was built a certain
way — but only a decision a human actually wrote down; it never infers or
guesses rationale from code or config. No `docs/adr/` directory → the page
is simply skipped, same as any other ungrounded page.

