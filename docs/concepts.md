---
sidebar_position: 3
sidebar_label: "Concepts"
title: "Concepts"
---

# Concepts

## Tour

A tour is a YAML file under `tours/` describing one feature walk: which pages to visit, what actions to take, and where to take screenshots. Each tour has an `id`, `title`, and `intent`, a `maturity` (`stable` or `draft`), a `status` (`confirmed`, `proposed`, or `archived`), a list of `steps`, and `code_paths` naming the source files that, if changed, mark the tour dirty. The confirmed tours in this repository are `login` ("Login page" — what a signed-out user sees before authenticating), `dashboard-overview` ("Dashboard overview" — what the main dashboard displays and how to read it), and `dashboard-export` ("Export dashboard activity" — exporting the current activity table as a CSV).

## Capture, drift, and generate

Capture is the stage that drives a headless browser through a tour against the real running app and records a screenshot plus an accessibility snapshot at each capture point, at every configured viewport. The drift check compares a new capture against the previous one and skips regenerating a tour's page when neither its screenshots nor its `code_paths` have changed, so the more expensive generate step only runs for tours that actually changed. Generate writes the tutorial prose for a dirty tour, grounded strictly in the accessibility snapshot from capture.

## Keep-region

A keep-region is hand-written content placed inside `<!-- autodocs:keep --> ... <!-- /autodocs:keep -->` markers in a generated page. Content inside these markers is preserved untouched across every future regeneration of that page.

## Auth profiles and seeds

An auth profile, declared under `autodocs.config.yaml`'s `auth` map, describes how to sign in for tours that need an authenticated session — either scripted username/password fields (`loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector`, `usernameEnv`, `passwordEnv`, `successUrlPattern`, as in this repository's `standard-user` profile) or a pre-recorded session via `storageStatePath` for logins scripting can't cover. A seed, declared under the `seeds` map and referenced by a tour's `preconditions.seed`, names a data fixture a tour depends on; it may be a no-op description (as with this repository's `demo-baseline`, since the demo app's data is static) or declare an actual `command`, which only runs when `allowSeedCommands` is explicitly set to `true`.

## Product pages

Product pages are the overview, getting-started, and concepts pages describing the product as a whole, as distinct from the per-tour tutorial pages that describe individual UI flows. They are grounded in the repository's own README, package.json, .env.example, autodocs.config.yaml, and the confirmed tour inventory, never in the running app.

<!-- autodocs:keep -->
<!-- Notes added here are preserved across regeneration. -->
<!-- /autodocs:keep -->
