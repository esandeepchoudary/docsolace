// CLI entry for /document map's dynamic-discovery half. Launches a real
// browser, crawls the running app same-origin/bounded (see
// lib/crawl.mjs), and writes a site map for the skill's code-review step to
// reconcile against the app's source.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config.mjs';
import { crawl } from './lib/crawl.mjs';
import { ensureAuthState, primaryViewport } from './lib/auth.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

function parseArgs(argv) {
  const args = { interactive: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--auth') args.auth = argv[i + 1];
    if (argv[i] === '--interactive') args.interactive = true;
    if (argv[i] === '--max-pages') args.maxPages = Number(argv[i + 1]);
    if (argv[i] === '--max-depth') args.maxDepth = Number(argv[i + 1]);
    if (argv[i] === '--start') (args.startPaths ??= []).push(argv[i + 1]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig('autodocs.config.yaml');

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

  const browser = await chromium.launch({ args: config.launchArgs ?? [] });
  try {
    let storageState;
    if (args.auth) {
      storageState = await ensureAuthState(browser, config, args.auth);
    }
    const context = await browser.newContext({ viewport: primaryViewport(config), storageState });
    try {
      const page = await context.newPage();
      const siteMap = await crawl(page, {
        baseUrl: config.baseUrl,
        startPaths: args.startPaths ?? config.crawl?.startPaths ?? ['/'],
        maxPages: args.maxPages ?? config.crawl?.maxPages ?? 50,
        maxDepth: args.maxDepth ?? config.crawl?.maxDepth ?? 4,
        interactive,
      });

      const outPath = path.join(config.outputDir, 'site-map.json');
      writeFileAtomic(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), pages: siteMap }, null, 2));
      console.log(`Crawled ${siteMap.length} page(s)${interactive ? ' (interactive mode)' : ''}. Wrote ${outPath}.`);
      for (const p of siteMap) {
        console.log(`  - ${p.route} (depth ${p.depth}): "${p.title}"`);
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
