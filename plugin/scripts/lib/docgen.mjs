// Exported so lib/product.mjs's renderProductPage can emit the exact same
// markers — every generated page (tour or product) shares one keep-region
// implementation (extractKeepRegion/nonKeepContent/applyKeepRegion below),
// never a second, subtly-different one.
export const KEEP_START = '<!-- autodocs:keep -->';
export const KEEP_END = '<!-- /autodocs:keep -->';
// Anchored to whole lines (^...$ with the multiline flag), not a bare
// substring match anywhere in the page. Both markers are always emitted as
// their own standalone line by renderTourPage/renderProductPage — but
// grounded prose describing AutoDocs' own keep-region mechanism (e.g. a
// product "concepts" page explaining what a keep-region is) can legitimately
// quote the marker text inline, mid-sentence, inside a much longer line. A
// bare substring match would count that quotation as a second real region
// and refuse to generate — confirmed by an actual product-scribe run whose
// "concepts" page prose did exactly this. Requiring the whole line to be
// nothing but the marker excludes an inline quotation (which always has
// other text before/after it on the same line) while still matching every
// real, structurally-emitted region.
const KEEP_REGION_SOURCE = '^<!-- autodocs:keep -->$\\n([\\s\\S]*?)\\n^<!-- /autodocs:keep -->$';
const KEEP_REGION_RE = new RegExp(KEEP_REGION_SOURCE, 'm');

// Bumped whenever a generated page's output *shape* changes (not its
// inputs) — renderTourPage's here, but also renderProductPage's and
// buildFrontmatter's (both lib/product.mjs), since generate-product-docs.mjs
// folds this same constant into its own render hash. Folded into
// generate-docs.mjs's/generate-product-docs.mjs's render hash (see
// lib/design.mjs) so the drift gate re-renders every existing page the next
// time this changes, instead of waiting for that tour's own screenshots or
// code_paths to move.
// v3: tour pages gained frontmatter (sidebar_position/sidebar_label) — see
// renderTourPage's optional `frontmatter` argument.
// v4: tour pages gained "Before you start"/"See also" cross-link blocks —
// see renderTourPage's optional `prerequisites`/`seeAlso` arguments.
// v5: every page (tour and product) gained a `description` frontmatter
// field — see lib/product.mjs's deriveMetaDescription/buildFrontmatter —
// for a page-specific search/answer-engine meta description instead of every
// page sharing the site-wide tagline.
export const RENDER_TEMPLATE_VERSION = 5;

// renderTourPage emits exactly one keep-region block. A second one (e.g. a
// human pasting in another `<!-- autodocs:keep -->` pair) isn't a supported
// shape — every helper below only sees the first match, so a second block
// would either get silently dropped or leak its markers into what's hashed
// as "generated" content. Fail loudly instead, same as the out-of-keep-
// region edit check in generate-docs.mjs does for other ambiguous edits.
function assertAtMostOneKeepRegion(markdown) {
  const matches = markdown.match(new RegExp(KEEP_REGION_SOURCE, 'gm'));
  if (matches && matches.length > 1) {
    throw new Error(
      `Found ${matches.length} "autodocs:keep" regions — only one is supported per page. ` +
        `Merge your notes into the single existing region before the next regeneration.`,
    );
  }
}

export function extractKeepRegion(markdown) {
  if (!markdown) return null;
  assertAtMostOneKeepRegion(markdown);
  const match = markdown.match(KEEP_REGION_RE);
  return match ? match[1].trim() : null;
}

// Everything except the keep-region — the basis for detecting whether a
// human edited a page outside the one region generation is allowed to
// clobber (see generate-docs.mjs's out-of-keep-region check).
export function nonKeepContent(markdown) {
  assertAtMostOneKeepRegion(markdown);
  return markdown.replace(KEEP_REGION_RE, '');
}

// Preserves the human-authored keep-region from `previousMarkdown` (if any)
// by splicing it into `newMarkdown`'s keep-region, so regeneration never
// clobbers human edits. `newMarkdown` must already contain one keep-region
// block (see renderTourPage).
export function applyKeepRegion(newMarkdown, previousMarkdown) {
  const previousContent = extractKeepRegion(previousMarkdown);
  if (previousContent === null) return newMarkdown;
  return newMarkdown.replace(KEEP_REGION_RE, `${KEEP_START}\n${previousContent}\n${KEEP_END}`);
}

// The <details class="..."> / <summary> lines below form a single raw HTML
// block (CommonMark: no blank line between them), which the markdown parser
// passes straight through to the built site unprocessed — unlike the
// `![alt](path)` lines elsewhere in this file, nothing here gets the
// automatic escaping normal markdown-to-HTML conversion provides. Escape
// explicitly before interpolating anything into this block. viewportName
// normally comes from autodocs.config.yaml's `viewports` map keys — config
// content, which CLAUDE.md's SSDLC section already treats as untrusted
// input for anything that shells out or renders — so this isn't only
// defense-in-depth.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A design skill's summary text for a non-primary viewport's collapsed
// block, e.g. "Mobile view" — falls back to a capitalized default when the
// project hasn't named one (see lib/design.mjs's doc-style.json shape).
// loadDocStyle already rejects HTML metacharacters in a custom label, but
// the fallback is built from the raw viewport name, so it's escaped too —
// see escapeHtml's comment above for why that matters here specifically.
function viewportSummary(viewportName, viewportLabels) {
  if (viewportLabels?.[viewportName]) return escapeHtml(viewportLabels[viewportName]);
  return escapeHtml(`${viewportName.charAt(0).toUpperCase()}${viewportName.slice(1)} view`);
}

// Renders one already-indented markdown image line, optionally wrapped in a
// `<figure class="autodocs-figure">` — an extra, opt-in theming hook (see
// doc-style.json's page.figures) for a design skill that wants its own
// framed/captioned screenshot treatment. Same blank-line discipline as the
// <details> blocks above: an HTML block only hands control back to the
// markdown parser after a blank line, so the image inside still resolves and
// bundles as a real asset instead of being swallowed as raw HTML text.
function imageLines(imageMarkdownLine, figures) {
  if (!figures) return [imageMarkdownLine, ''];
  return ['   <figure class="autodocs-figure">', '', imageMarkdownLine, '', '   </figure>', ''];
}

// Renders a "**<label>:**" bullet list of already-resolved {id, title} tour
// links (see generate-docs.mjs, which resolves a tour's prerequisites/
// see_also ids against the live tour inventory before calling this — only
// real, published tours ever reach here; a dangling or unpublished id is a
// validate.mjs finding, not something this renderer decides). Each link is a
// same-directory relative reference ("<id>.md"), matching the exact pattern
// lib/product.mjs's renderProductPage already uses for the overview page's
// own tour index.
function crossLinkBlock(label, tours) {
  if (!tours || tours.length === 0) return [];
  return [`**${label}:**`, '', ...tours.map((t) => `- [${t.title}](${t.id}.md)`), ''];
}

export function renderTourPage({ title, intent, steps, keepRegionPlaceholder, style, frontmatter, prerequisites, seeAlso }) {
  const {
    primaryViewport,
    collapseOtherViewports = true,
    viewportLabels = {},
    stepsHeading = 'Steps',
    figures = false,
  } = style ?? {};

  const stepBlocks = steps.map((step, index) => {
    const lines = [`${index + 1}. **${step.description}**`, ''];
    const images = step.images ?? (step.imagePath ? [{ path: step.imagePath }] : []);

    if (images.length > 1 && collapseOtherViewports) {
      // The primary viewport's screenshot stays inline, unlabeled — every
      // other viewport moves into its own collapsed <details> block instead
      // of stacking full-page screenshots the reader has to scroll past.
      // Blank lines around the image (both here and inside the <details>
      // block below) are load-bearing: CommonMark only resumes parsing
      // markdown — rather than treating everything as raw HTML — after a
      // blank line inside an HTML block, and markdown image syntax (not a
      // raw <img> tag) is what lets Docusaurus resolve/bundle the asset.
      const primaryIndex = primaryViewport ? images.findIndex((img) => img.viewport === primaryViewport) : -1;
      const primaryImage = primaryIndex >= 0 ? images[primaryIndex] : images[0];
      lines.push(...imageLines(`   ![${step.description}](${primaryImage.path})`, figures));
      for (const image of images) {
        if (image === primaryImage) continue;
        lines.push(
          `   <details class="autodocs-viewport autodocs-viewport--${escapeHtml(image.viewport)}">`,
          `   <summary>${viewportSummary(image.viewport, viewportLabels)}</summary>`,
          '',
          ...imageLines(`   ![${step.description} (${image.viewport})](${image.path})`, figures),
          '   </details>',
          '',
        );
      }
    } else {
      // Only label images by viewport when there's more than one — keeps
      // single-viewport output identical to before multi-viewport support.
      const showLabels = images.length > 1;
      for (const image of images) {
        const alt = showLabels ? `${step.description} (${image.viewport})` : step.description;
        if (showLabels) lines.push(`   *${image.viewport}*`, '');
        lines.push(`   ![${alt}](${image.path})`, '');
      }
    }

    lines.push(`   ${step.paragraph}`);
    return lines.join('\n');
  });

  const body = [
    `# ${title}`,
    '',
    ...crossLinkBlock('Before you start', prerequisites),
    intent,
    '',
    `## ${stepsHeading}`,
    '',
    stepBlocks.join('\n\n'),
    '',
    ...crossLinkBlock('See also', seeAlso),
    KEEP_START,
    keepRegionPlaceholder ?? '<!-- Notes added here are preserved across regeneration. -->',
    KEEP_END,
    '',
  ].join('\n');

  // frontmatter (see lib/product.mjs's buildFrontmatter) already ends in its
  // own trailing newline after the closing "---" — one more blank line here
  // just separates it from the "# Title" heading, same spacing a human would
  // write by hand. Optional: a project with no docs.sections configured never
  // passes this, and every page renders exactly as it did before frontmatter
  // support existed.
  return frontmatter ? `${frontmatter}\n${body}` : body;
}
