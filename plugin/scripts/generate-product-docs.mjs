// Assembles the product-level documentation layer (docs/overview.md,
// docs/getting-started.md, docs/concepts.md, plus docs/_sidebar.docsolace.json)
// from lib/product.mjs's helpers, gated by the same drift-hash shape
// generate-docs.mjs uses for tour pages. Prose comes from whichever the
// `product-scribe` subagent wrote to
// .docsolace/artifacts/prose/_product.json (see plugin/agents/
// product-scribe.md) — there's no hardcoded fallback the way
// generate-docs.mjs has for the two demo tours, since a project's product
// pages have no equivalent "runnable without a subagent" demo content.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { loadTour } from './lib/tours.mjs';
import { applyKeepRegion, nonKeepContent, RENDER_TEMPLATE_VERSION } from './lib/docgen.mjs';
import { computeRenderHash, loadDocStyle } from './lib/design.mjs';
import { resolveShortHeadCommit } from './lib/drift.mjs';
import {
  PRODUCT_PAGES,
  PRODUCT_PAGE_IDS,
  PRODUCT_STATE_KEY,
  buildFrontmatter,
  buildSidebarStructure,
  collectProductSources,
  computeProductInputsHash,
  deriveMetaDescription,
  getProductDirtyReasons,
  isPublishedTour,
  renderProductPage,
  resolveChangelogGitTags,
} from './lib/product.mjs';
import { sha256Buffer } from './lib/manifest.mjs';
import { loadState, saveTourState } from './lib/state.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';

function parseArgs(argv) {
  const args = { force: false, pages: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') args.force = true;
    if (argv[i] === '--page') args.pages.push(argv[++i]);
  }
  return args;
}

function loadAllTours() {
  if (!fs.existsSync('tours')) return [];
  return fs
    .readdirSync('tours')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .map((id) => loadTour('tours', id));
}

function main() {
  const { force, pages: requestedPages } = parseArgs(process.argv.slice(2));
  const config = loadConfig('docsolace.config.yaml');
  const tours = loadAllTours();

  const enabledPageIds = config.product?.pages ?? PRODUCT_PAGE_IDS;
  // enabledPages (config-driven) is distinct from pagesToGenerate
  // (additionally --page-scoped for this run): docs/_sidebar.docsolace.json
  // is one shared file covering every product page, so a --page-scoped run
  // must still list every *enabled* page in it — narrowing it to just the
  // pages this one invocation happened to touch would silently drop the
  // others from the sidebar even though their doc files are untouched and
  // still on disk. Confirmed by reproducing it directly: running
  // `--page overview` shrank productPages to `["overview"]` alone.
  const enabledPages = PRODUCT_PAGES.filter((p) => enabledPageIds.includes(p.id));
  let pagesToGenerate = enabledPages;

  if (requestedPages.length > 0) {
    const unknown = requestedPages.filter((id) => !PRODUCT_PAGE_IDS.includes(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown --page value(s): ${unknown.join(', ')} — must be one of ${PRODUCT_PAGE_IDS.join(', ')}`);
    }
    pagesToGenerate = pagesToGenerate.filter((p) => requestedPages.includes(p.id));
  }

  if (pagesToGenerate.length === 0) {
    console.log('No product pages enabled — check docsolace.config.yaml\'s "product.pages" or the --page flag.');
    return;
  }

  const sourceFiles = collectProductSources(process.cwd(), config);
  const gitTags = resolveChangelogGitTags({ cwd: process.cwd(), enabledPageIds });
  const currentInputsHash = computeProductInputsHash({ cwd: process.cwd(), sourceFiles, tours, gitTags });

  // Same docsConfig/pageStyle/render-hash computation generate-docs.mjs
  // does for tour pages — a template or design-style change re-renders the
  // product pages too, on the same schedule, from the same source of truth.
  const docsConfig = config.docs ?? {};
  const docStyle = loadDocStyle(process.cwd());
  const pageStyle = docStyle.page ?? {};
  const currentRenderHash = computeRenderHash({ templateVersion: RENDER_TEMPLATE_VERSION, docsConfig, pageStyle });

  const statePath = path.join(config.outputDir, 'state.json');
  const state = loadState(statePath);
  const previousEntry = state[PRODUCT_STATE_KEY];

  const reasons = getProductDirtyReasons({ previousEntry, currentInputsHash, currentRenderHash });
  if (reasons.length === 0) {
    console.log('Product pages are unchanged since the last generation — skipping.');
    return;
  }

  const prosePath = path.join(config.outputDir, 'prose', '_product.json');
  if (!fs.existsSync(prosePath)) {
    throw new Error(
      `No product-scribe prose found at "${prosePath}" — dispatch the product-scribe subagent first ` +
        `(see plugin/skills/document/SKILL.md's "Document the product itself").`,
    );
  }
  let prose;
  try {
    prose = JSON.parse(fs.readFileSync(prosePath, 'utf8'));
  } catch (err) {
    throw new Error(`"${prosePath}" is not valid JSON (${err.message})`);
  }
  if (!prose || typeof prose !== 'object' || Array.isArray(prose)) {
    throw new Error(`"${prosePath}" must be a JSON object keyed by page id`);
  }

  const publishedTours = tours.filter(isPublishedTour);
  const tourIndex = publishedTours
    .map((t) => ({ id: t.id, title: t.title ?? t.id, intent: t.intent }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const previousPages = previousEntry?.pages ?? {};
  const newPagesState = {};
  const written = [];
  const skippedNoGrounding = [];
  const refusals = [];

  // Computed once per run (not per page) — every page this run actually
  // writes shares the same "generated at this moment, against this commit"
  // stamp, same as generate-docs.mjs does for a tour page. Reused for both
  // the (opt-in) frontmatter stamp and each written page's state.json entry
  // — see lib/product.mjs's buildFrontmatter and lib/status.mjs.
  const generatedAt = new Date().toISOString();
  const generatedAtCommit = resolveShortHeadCommit();

  for (const page of pagesToGenerate) {
    const pageProse = prose[page.id];
    if (!pageProse) {
      skippedNoGrounding.push(page.id);
      continue;
    }

    const frontmatter = buildFrontmatter({
      sidebarPosition: page.sidebarPosition,
      sidebarLabel: page.sidebarLabel,
      title: page.title,
      description: deriveMetaDescription(pageProse.sections?.[0]?.body ?? ''),
      lastVerified: docsConfig.stampVerified ? `${generatedAt.slice(0, 10)} (${generatedAtCommit})` : undefined,
    });

    const docPath = path.join('docs', `${page.id}.md`);
    const previousMarkdown = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : undefined;
    const previousPageEntry = previousPages[page.id];

    // If a human edited this page outside its keep-region since the last
    // generation, warn loudly instead of silently clobbering their edit —
    // same guard generate-docs.mjs has for tour pages.
    if (previousMarkdown !== undefined && previousPageEntry?.bodyHash) {
      const currentBodyHash = sha256Buffer(Buffer.from(nonKeepContent(previousMarkdown)));
      if (currentBodyHash !== previousPageEntry.bodyHash) {
        if (!force) {
          refusals.push(docPath);
          continue;
        }
        console.warn(`"${page.id}": overwriting an edit made outside the keep-region (--force).`);
      }
    }

    const newMarkdown = renderProductPage({
      page,
      prose: pageProse,
      tourIndex: page.includeTourIndex ? tourIndex : undefined,
      frontmatter,
    });
    const finalMarkdown = applyKeepRegion(newMarkdown, previousMarkdown);

    fs.mkdirSync('docs', { recursive: true });
    fs.writeFileSync(docPath, finalMarkdown);
    written.push(docPath);
    newPagesState[page.id] = {
      bodyHash: sha256Buffer(Buffer.from(nonKeepContent(finalMarkdown))),
      generatedAt,
      generatedAtCommit,
    };
  }

  // Preserve state for pages untouched this run (skipped for lack of
  // grounding, or a --page-scoped run that only targeted some pages) so a
  // later run's drift check doesn't treat them as "never generated" again.
  const mergedPages = { ...previousPages, ...newPagesState };

  // Checked against the filesystem *after* the write loop above, not just
  // "enabled in config" — site/sidebars.js spreads productPages directly as
  // literal Docusaurus sidebar item ids, and a listed id with no matching
  // docs/<id>.md **fails the site build**, not just a broken link. An
  // enabled-but-ungrounded page (configuration/troubleshooting/changelog on
  // a project without their grounding — the expected case, not an edge
  // case, now that those three default on) is real and correctly excluded
  // here; this also naturally keeps a page from a *previous* run that still
  // has a file (skipped this run, not deleted) correctly included.
  const enabledPagesWithFile = enabledPages.filter((p) => fs.existsSync(path.join('docs', `${p.id}.md`)));
  const sidebarStructure = buildSidebarStructure({
    pages: enabledPagesWithFile,
    sections: config.docs?.sections,
    tours,
  });

  writeFileAtomic(path.join('docs', '_sidebar.docsolace.json'), `${JSON.stringify(sidebarStructure, null, 2)}\n`);

  // Only advance the top-level inputsHash/renderHash when every page this
  // run touched actually succeeded. If any page refused (hand-edited outside
  // its keep-region, no --force), persisting the *new* hashes here would
  // make the top-level drift gate at the top of this file see the whole
  // product-doc set as "clean" on the next run — before that run's own
  // --force flag ever gets a chance to matter — permanently masking the
  // refused page's staleness behind a run that only partially succeeded.
  // Keeping the previous entry's hashes (or omitting one if there wasn't a
  // previous run) means the next invocation, --force or not, sees the same
  // dirty reasons and gets another chance at every page, refused or not
  // (mildly redundant for the ones that already succeeded, but harmless —
  // deterministic re-render of unchanged inputs).
  if (refusals.length === 0) {
    saveTourState(statePath, PRODUCT_STATE_KEY, {
      inputsHash: currentInputsHash,
      renderHash: currentRenderHash,
      pages: mergedPages,
    });
  } else if (previousEntry) {
    saveTourState(statePath, PRODUCT_STATE_KEY, {
      inputsHash: previousEntry.inputsHash,
      renderHash: previousEntry.renderHash,
      pages: mergedPages,
    });
  } else {
    saveTourState(statePath, PRODUCT_STATE_KEY, { pages: mergedPages });
  }

  console.log(written.length > 0 ? `Generated: ${written.join(', ')}` : 'Generated: (nothing — see below)');
  if (skippedNoGrounding.length > 0) {
    console.log(`Skipped (product-scribe found no grounding): ${skippedNoGrounding.join(', ')}`);
  }
  console.log('Wrote docs/_sidebar.docsolace.json');

  if (refusals.length > 0) {
    console.error(
      `${refusals.join(', ')} ${refusals.length === 1 ? 'was' : 'were'} edited outside its ` +
        `<!-- docsolace:keep --> region since the last generation. Move the edit into the keep-region, or ` +
        `re-run with --force to overwrite it.`,
    );
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
