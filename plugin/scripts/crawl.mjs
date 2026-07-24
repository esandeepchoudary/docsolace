// CLI entry for /document map's dynamic-discovery half. Launches a real
// browser, crawls the running app same-origin/bounded (see
// lib/crawl.mjs), and writes a site map for the skill's code-review step to
// reconcile against the app's source.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { assertSiteRelativePath, crawl, mergeSiteMaps } from './lib/crawl.mjs';
import { ensureAuthState, primaryViewport } from './lib/auth.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

function parseArgs(argv) {
  const args = { interactive: false, allAuth: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--auth') args.auth = argv[i + 1];
    if (argv[i] === '--all-auth') args.allAuth = true;
    if (argv[i] === '--interactive') args.interactive = true;
    if (argv[i] === '--max-pages') args.maxPages = Number(argv[i + 1]);
    if (argv[i] === '--max-depth') args.maxDepth = Number(argv[i + 1]);
    if (argv[i] === '--start') (args.startPaths ??= []).push(argv[i + 1]);
    if (argv[i] === '--routes-file') args.routesFile = argv[i + 1];
  }
  return args;
}

// Reads /document map's "confirmation crawl" input: a JSON array of
// site-relative routes enumerated from the app's own source (see SKILL.md's
// "Map the whole app" step 3-4). Same untrusted-input trust boundary as tour
// YAML per CLAUDE.md — this file is skill-written, not hand-authored, but
// still gets the identical site-relative validation crawl()'s own startPaths
// guard applies, named against this file so a bad entry is easy to trace.
function loadRoutesFile(routesFile) {
  let raw;
  try {
    raw = fs.readFileSync(routesFile, 'utf8');
  } catch (err) {
    throw new Error(`--routes-file "${routesFile}" could not be read: ${err.message}`);
  }
  let routes;
  try {
    routes = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--routes-file "${routesFile}" is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(routes)) {
    throw new Error(`--routes-file "${routesFile}" must contain a JSON array of site-relative route strings`);
  }
  for (const route of routes) {
    assertSiteRelativePath(route, `--routes-file "${routesFile}" entry`);
  }
  return routes;
}

// Runs one crawl pass in its own browser context (own storage state, so one
// profile's cookies never leak into another's) and returns its site map,
// tagged with `reachedBy: passId`. Isolated per pass so a page that renders
// differently per role (or an interactive-mode form submit) can't carry
// state across passes.
async function runPass(browser, config, { passId, authProfileId, startPaths, maxPages, maxDepth, interactive }) {
  let storageState;
  if (authProfileId) {
    storageState = await ensureAuthState(browser, config, authProfileId);
  }
  const context = await browser.newContext({ viewport: primaryViewport(config), storageState });
  try {
    const page = await context.newPage();
    return await crawl(page, { baseUrl: config.baseUrl, startPaths, maxPages, maxDepth, interactive, reachedBy: passId });
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig('autodocs.config.yaml');

  if (args.auth && args.allAuth) {
    console.error('Error: pass either --auth <profile> or --all-auth, not both.');
    process.exit(1);
  }

  // Interactive (mutating) crawling is double-opt-in — both the runtime
  // flag AND the config flag must be set, mirroring capture.mjs's
  // allowSeedCommands gate. Neither alone is enough: a stray --interactive
  // on someone's command line shouldn't mutate a project that never turned
  // this on in config, and a project with the flag on shouldn't have every
  // future crawl silently mutate data just because the config file exists.
  if (args.interactive && config.crawl?.allowInteractive !== true) {
    console.error(
      'Error: --interactive was passed but "crawl.allowInteractive" is not set to true in ' +
        'autodocs.config.yaml. Interactive crawling fills in and submits forms with synthetic data on a ' +
        'real running app — only enable it against a throwaway/dev environment, never production, by ' +
        'setting "crawl:\\n  allowInteractive: true" in config as well.',
    );
    process.exit(1);
  }
  const interactive = args.interactive && config.crawl?.allowInteractive === true;

  // --routes-file is the "confirmation crawl" (SKILL.md step 4): visit every
  // route the code-review step found in source, directly, to confirm it
  // renders (or see where it redirects/gates to) — not a BFS discovery, so
  // maxDepth is forced to 0 regardless of config/--max-depth, and maxPages is
  // raised to fit every listed route even if that exceeds the default cap.
  let startPaths = args.startPaths ?? config.crawl?.startPaths ?? ['/'];
  let maxDepth = args.maxDepth ?? config.crawl?.maxDepth ?? 4;
  if (args.routesFile) {
    startPaths = loadRoutesFile(args.routesFile);
    maxDepth = 0;
  }
  const maxPages = args.maxPages ?? config.crawl?.maxPages ?? Math.max(50, startPaths.length);

  // Which passes to run, each tagged with the id later recorded as that
  // page's reachedBy entry:
  //   --all-auth        → one pass per configured auth profile, plus one
  //                        anonymous (signed-out) pass, merged.
  //   --auth <profile>  → exactly that one profile (today's behavior).
  //   neither           → a single anonymous pass (today's default).
  // A profile whose session can't be established (missing storageStatePath,
  // missing credentials) is skipped with a clear reason rather than aborting
  // the whole run — one missing role shouldn't block mapping every other
  // feature reachable under the rest.
  const passes = args.allAuth
    ? [{ passId: 'anonymous', authProfileId: undefined }, ...Object.keys(config.auth ?? {}).map((id) => ({ passId: id, authProfileId: id }))]
    : args.auth
      ? [{ passId: args.auth, authProfileId: args.auth }]
      : [{ passId: 'anonymous', authProfileId: undefined }];

  const browser = await chromium.launch({ args: config.launchArgs ?? [] });
  try {
    const siteMaps = [];
    const skipped = [];
    for (const { passId, authProfileId } of passes) {
      try {
        const siteMap = await runPass(browser, config, { passId, authProfileId, startPaths, maxPages, maxDepth, interactive });
        siteMaps.push(siteMap);
        console.log(`Pass "${passId}": crawled ${siteMap.length} page(s).`);
      } catch (err) {
        skipped.push({ passId, reason: err.message });
        console.warn(`Skipping pass "${passId}": ${err.message}`);
      }
    }

    if (siteMaps.length === 0) {
      console.error('Error: every crawl pass was skipped — see the warnings above. Nothing was written.');
      process.exit(1);
    }

    const merged = mergeSiteMaps(siteMaps);
    const outPath = path.join(config.outputDir, 'site-map.json');
    writeFileAtomic(
      outPath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), skippedPasses: skipped, pages: merged },
        null,
        2,
      ),
    );
    console.log(
      `Crawled ${merged.length} unique page(s) across ${siteMaps.length} pass(es)${interactive ? ' (interactive mode)' : ''}. Wrote ${outPath}.`,
    );
    for (const p of merged) {
      const roles = p.reachedBy?.length ? ` [${p.reachedBy.join(', ')}]` : '';
      console.log(`  - ${p.route} (depth ${p.depth})${roles}: "${p.title}"`);
    }
    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} pass(es): ${skipped.map((s) => s.passId).join(', ')} — see warnings above.`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
