import { describe, expect, it } from 'vitest';
import {
  applyKeepRegion,
  extractKeepRegion,
  KEEP_END,
  KEEP_START,
  nonKeepContent,
  RENDER_TEMPLATE_VERSION,
  renderTourPage,
} from '../docgen.mjs';

describe('renderTourPage', () => {
  const page = renderTourPage({
    title: 'Demo tour',
    intent: 'Shows the demo flow.',
    steps: [
      { description: 'Step one', imagePath: 'images/demo/step-1.png', paragraph: 'This is step one.' },
      { description: 'Step two', imagePath: null, paragraph: 'This is step two, no image.' },
    ],
  });

  it('includes the title and intent', () => {
    expect(page).toContain('# Demo tour');
    expect(page).toContain('Shows the demo flow.');
  });

  it('renders ordered steps with inlined images and one paragraph each', () => {
    expect(page).toContain('1. **Step one**');
    expect(page).toContain('![Step one](images/demo/step-1.png)');
    expect(page).toContain('This is step one.');
    expect(page).toContain('2. **Step two**');
    expect(page).toContain('This is step two, no image.');
  });

  it('omits an image line for steps with no imagePath', () => {
    const stepTwoBlock = page.split('2. **Step two**')[1];
    expect(stepTwoBlock).not.toContain('![Step two]');
  });

  it('always includes an empty keep-region block', () => {
    expect(extractKeepRegion(page)).toBe(
      '<!-- Notes added here are preserved across regeneration. -->',
    );
  });
});

describe('renderTourPage with the images array (multi-viewport)', () => {
  it('renders a single-viewport images array with no viewport label', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [{ viewport: 'desktop', path: 'a@desktop.png' }],
          paragraph: 'Paragraph.',
        },
      ],
    });
    expect(page).toContain('![Step one](a@desktop.png)');
    expect(page).not.toContain('*desktop*');
    expect(page).not.toContain('<details');
  });

  it('by default (collapseOtherViewports unset) inlines the first image and collapses the rest', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
    });
    // Primary (first) image inline, unlabeled, before any <details> block.
    expect(page.indexOf('![Step one](a@desktop.png)')).toBeLessThan(page.indexOf('<details'));
    expect(page).not.toContain('*desktop*');
    // Non-primary image inside a collapsed, classed <details> block.
    expect(page).toContain('<details class="docsolace-viewport docsolace-viewport--mobile">');
    expect(page).toContain('<summary>Mobile view</summary>');
    expect(page).toContain('![Step one (mobile)](a@mobile.png)');
    expect(page).toContain('</details>');
  });

  it('honors an explicit primaryViewport, even if it is not the first image', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
      style: { primaryViewport: 'mobile' },
    });
    expect(page.indexOf('![Step one](a@mobile.png)')).toBeLessThan(page.indexOf('<details'));
    expect(page).toContain('<details class="docsolace-viewport docsolace-viewport--desktop">');
    expect(page).toContain('![Step one (desktop)](a@desktop.png)');
  });

  it('uses custom viewportLabels for the collapsed summary text when provided', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
      style: { viewportLabels: { mobile: 'On your phone' } },
    });
    expect(page).toContain('<summary>On your phone</summary>');
  });

  it('applies a blank line before and after the image inside the collapsed block', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
    });
    const detailsBlock = page.slice(page.indexOf('<details'), page.indexOf('</details>') + '</details>'.length);
    const detailsLines = detailsBlock.split('\n');
    const imageLineIndex = detailsLines.findIndex((l) => l.includes('![Step one (mobile)]'));
    expect(detailsLines[imageLineIndex - 1].trim()).toBe('');
    expect(detailsLines[imageLineIndex + 1].trim()).toBe('');
  });

  it('collapseOtherViewports: false restores the old flat, all-inline layout', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
      style: { collapseOtherViewports: false },
    });
    expect(page).toContain('*desktop*');
    expect(page).toContain('![Step one (desktop)](a@desktop.png)');
    expect(page).toContain('*mobile*');
    expect(page).toContain('![Step one (mobile)](a@mobile.png)');
    expect(page).not.toContain('<details');
  });

  it('wraps images in a <figure> when style.figures is true', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
      style: { figures: true },
    });
    const figureCount = (page.match(/<figure class="docsolace-figure">/g) ?? []).length;
    expect(figureCount).toBe(2); // one for the primary image, one for the collapsed one
    expect(page).toContain('</figure>');
    expect(page).toContain('![Step one](a@desktop.png)');
    expect(page).toContain('![Step one (mobile)](a@mobile.png)');
  });

  it('does not wrap images in <figure> by default', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
    });
    expect(page).not.toContain('docsolace-figure');
  });

  it('HTML-escapes a viewport name before it reaches the raw <details>/<summary> block', () => {
    // config.mjs's own viewport-name validation rejects this in practice,
    // but renderTourPage shouldn't rely on that alone — the <details>/
    // <summary> lines form one raw CommonMark HTML block (no blank line
    // between them), so nothing embedded there gets markdown's automatic
    // escaping the way a markdown `![alt](path)` line does (its alt text is
    // legitimately unescaped *here*, in the markdown source — the renderer
    // escapes it when it builds the final <img alt="..."> attribute, same
    // as any other markdown image, so this test only needs to check the
    // raw-HTML-block lines, not the whole page).
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: '"><script>alert(1)</script>', path: 'a@evil.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
    });
    const detailsLine = page.split('\n').find((l) => l.includes('<details'));
    const summaryLine = page.split('\n').find((l) => l.includes('<summary'));
    expect(detailsLine).not.toContain('<script>');
    expect(detailsLine).toContain('&lt;script&gt;');
    expect(summaryLine).not.toContain('<script>');
    expect(summaryLine).toContain('&lt;script&gt;');
  });

  it('HTML-escapes a custom viewportLabels value too, in case it reaches renderTourPage unvalidated', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [
        {
          description: 'Step one',
          images: [
            { viewport: 'desktop', path: 'a@desktop.png' },
            { viewport: 'mobile', path: 'a@mobile.png' },
          ],
          paragraph: 'Paragraph.',
        },
      ],
      style: { viewportLabels: { mobile: '<img src=x onerror=alert(1)>' } },
    });
    expect(page).not.toContain('<img src=x onerror=alert(1)>');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('supports a custom stepsHeading', () => {
    const page = renderTourPage({
      title: 'Tour',
      intent: 'Intent.',
      steps: [{ description: 'Step', imagePath: 'a.png', paragraph: 'Paragraph.' }],
      style: { stepsHeading: 'Walkthrough' },
    });
    expect(page).toContain('## Walkthrough');
    expect(page).not.toContain('## Steps');
  });
});

describe('renderTourPage cross-links (prerequisites/seeAlso)', () => {
  const baseArgs = {
    title: 'Dashboard',
    intent: 'Shows the dashboard.',
    steps: [{ description: 'Step', imagePath: 'a.png', paragraph: 'Paragraph.' }],
  };

  it('renders a "Before you start" block from prerequisites, linking to <id>.md', () => {
    const page = renderTourPage({ ...baseArgs, prerequisites: [{ id: 'login', title: 'Login page' }] });
    expect(page).toContain('**Before you start:**');
    expect(page).toContain('- [Login page](login.md)');
  });

  it('renders a "See also" block from seeAlso, linking to <id>.md', () => {
    const page = renderTourPage({ ...baseArgs, seeAlso: [{ id: 'dashboard-export', title: 'Export dashboard activity' }] });
    expect(page).toContain('**See also:**');
    expect(page).toContain('- [Export dashboard activity](dashboard-export.md)');
  });

  it('renders multiple entries in the order given', () => {
    const page = renderTourPage({
      ...baseArgs,
      seeAlso: [
        { id: 'a', title: 'A tour' },
        { id: 'b', title: 'B tour' },
      ],
    });
    const seeAlsoIndex = page.indexOf('**See also:**');
    const aIndex = page.indexOf('- [A tour](a.md)');
    const bIndex = page.indexOf('- [B tour](b.md)');
    expect(seeAlsoIndex).toBeGreaterThan(-1);
    expect(aIndex).toBeGreaterThan(seeAlsoIndex);
    expect(bIndex).toBeGreaterThan(aIndex);
  });

  it('omits both blocks entirely when neither is given (unchanged output)', () => {
    const page = renderTourPage(baseArgs);
    expect(page).not.toContain('Before you start');
    expect(page).not.toContain('See also');
  });

  it('omits a block when the list is empty rather than rendering an empty heading', () => {
    const page = renderTourPage({ ...baseArgs, prerequisites: [], seeAlso: [] });
    expect(page).not.toContain('Before you start');
    expect(page).not.toContain('See also');
  });

  it('"Before you start" appears before the intent, "See also" appears after the steps', () => {
    const page = renderTourPage({
      ...baseArgs,
      prerequisites: [{ id: 'login', title: 'Login page' }],
      seeAlso: [{ id: 'export', title: 'Export' }],
    });
    const beforeIndex = page.indexOf('Before you start');
    const intentIndex = page.indexOf(baseArgs.intent);
    const stepsIndex = page.indexOf('## Steps');
    const seeAlsoIndex = page.indexOf('See also');
    expect(beforeIndex).toBeLessThan(intentIndex);
    expect(stepsIndex).toBeLessThan(seeAlsoIndex);
  });
});

describe('RENDER_TEMPLATE_VERSION', () => {
  it('is exported as a stable integer other modules can hash', () => {
    expect(Number.isInteger(RENDER_TEMPLATE_VERSION)).toBe(true);
  });
});

describe('KEEP_START / KEEP_END', () => {
  it('are exported so other renderers (lib/product.mjs) share one keep-region implementation', () => {
    expect(KEEP_START).toBe('<!-- docsolace:keep -->');
    expect(KEEP_END).toBe('<!-- /docsolace:keep -->');
  });
});

describe('renderTourPage with frontmatter', () => {
  const base = {
    title: 'Tour',
    intent: 'Intent.',
    steps: [{ description: 'Step', imagePath: 'a.png', paragraph: 'Paragraph.' }],
  };

  it('prepends the given frontmatter block before the title', () => {
    const page = renderTourPage({ ...base, frontmatter: '---\nsidebar_position: 10\n---\n' });
    expect(page.startsWith('---\nsidebar_position: 10\n---\n\n# Tour')).toBe(true);
  });

  it('renders with no frontmatter block at all when none is given (back-compat)', () => {
    const page = renderTourPage(base);
    expect(page.startsWith('# Tour')).toBe(true);
    expect(page).not.toContain('sidebar_position');
  });

  it('keep-region and step content are unaffected by frontmatter presence', () => {
    const withFm = renderTourPage({ ...base, frontmatter: '---\nsidebar_position: 1\n---\n' });
    const withoutFm = renderTourPage(base);
    expect(nonKeepContent(withFm).replace(/^---\n[\s\S]*?\n---\n\n/, '')).toBe(nonKeepContent(withoutFm));
  });
});

describe('extractKeepRegion', () => {
  it('returns null when there is no keep-region', () => {
    expect(extractKeepRegion('# No keep region here')).toBeNull();
  });

  it('extracts trimmed content between the markers', () => {
    const md = '# Page\n\n<!-- docsolace:keep -->\n  Some human note.  \n<!-- /docsolace:keep -->\n';
    expect(extractKeepRegion(md)).toBe('Some human note.');
  });

  it('throws when the page has more than one keep-region', () => {
    const md =
      '# Page\n\n<!-- docsolace:keep -->\nFirst.\n<!-- /docsolace:keep -->\n\nMore text.\n\n' +
      '<!-- docsolace:keep -->\nSecond.\n<!-- /docsolace:keep -->\n';
    expect(() => extractKeepRegion(md)).toThrow(/only one is supported/);
  });

  it('does not treat an inline, mid-sentence mention of the marker text as a second region', () => {
    // Regression: a product-scribe-authored "concepts" page describing what
    // a keep-region *is* legitimately quotes the marker text inline, e.g.
    // "...placed inside `<!-- docsolace:keep --> ... <!-- /docsolace:keep -->`
    // markers...". That's one line of prose containing both marker
    // substrings, not a second structural region — it must not trip the
    // "only one is supported" guard alongside the one real region below.
    const md =
      '# Concepts\n\n' +
      'A keep-region is content placed inside `<!-- docsolace:keep --> ... <!-- /docsolace:keep -->` markers.\n\n' +
      '<!-- docsolace:keep -->\nReal note.\n<!-- /docsolace:keep -->\n';
    expect(() => extractKeepRegion(md)).not.toThrow();
    expect(extractKeepRegion(md)).toBe('Real note.');
  });
});

describe('nonKeepContent', () => {
  it('removes the entire keep-region block, markers included', () => {
    const md = '# Page\n\nBody text.\n\n<!-- docsolace:keep -->\nA human note.\n<!-- /docsolace:keep -->\n';
    const stripped = nonKeepContent(md);
    expect(stripped).toContain('# Page');
    expect(stripped).toContain('Body text.');
    expect(stripped).not.toContain('A human note.');
    expect(stripped).not.toContain('docsolace:keep');
  });

  it('is unaffected by changes to keep-region content alone', () => {
    const base = '# Page\n\nBody.\n\n<!-- docsolace:keep -->\n%NOTE%\n<!-- /docsolace:keep -->\n';
    const withNoteA = base.replace('%NOTE%', 'Note A');
    const withNoteB = base.replace('%NOTE%', 'Note B');
    expect(nonKeepContent(withNoteA)).toBe(nonKeepContent(withNoteB));
  });

  it('changes when body content outside the keep-region changes', () => {
    const md1 = '# Page\n\nBody one.\n\n<!-- docsolace:keep -->\nNote.\n<!-- /docsolace:keep -->\n';
    const md2 = '# Page\n\nBody two.\n\n<!-- docsolace:keep -->\nNote.\n<!-- /docsolace:keep -->\n';
    expect(nonKeepContent(md1)).not.toBe(nonKeepContent(md2));
  });

  it('throws when the page has more than one keep-region', () => {
    const md =
      '# Page\n\n<!-- docsolace:keep -->\nFirst.\n<!-- /docsolace:keep -->\n\nMore text.\n\n' +
      '<!-- docsolace:keep -->\nSecond.\n<!-- /docsolace:keep -->\n';
    expect(() => nonKeepContent(md)).toThrow(/only one is supported/);
  });

  it('does not treat an inline, mid-sentence mention of the marker text as a second region', () => {
    const md =
      '# Concepts\n\n' +
      'A keep-region is content placed inside `<!-- docsolace:keep --> ... <!-- /docsolace:keep -->` markers.\n\n' +
      '<!-- docsolace:keep -->\nReal note.\n<!-- /docsolace:keep -->\n';
    const stripped = nonKeepContent(md);
    expect(stripped).toContain('# Concepts');
    expect(stripped).toContain('A keep-region is content placed inside');
    expect(stripped).not.toContain('Real note.');
  });
});

describe('applyKeepRegion', () => {
  const fresh = renderTourPage({
    title: 'Tour',
    intent: 'Intent.',
    steps: [{ description: 'Step', imagePath: 'a.png', paragraph: 'Paragraph.' }],
  });

  it('returns newMarkdown unchanged when there is no previous version (first generation)', () => {
    expect(applyKeepRegion(fresh, undefined)).toBe(fresh);
  });

  it('preserves human-authored keep-region content from the previous version', () => {
    const previous = fresh.replace(
      '<!-- Notes added here are preserved across regeneration. -->',
      'This flow is being redesigned next quarter.',
    );
    const merged = applyKeepRegion(fresh, previous);
    expect(extractKeepRegion(merged)).toBe('This flow is being redesigned next quarter.');
  });

  it('only touches the keep-region — the rest of the page reflects the new content', () => {
    const updated = renderTourPage({
      title: 'Tour',
      intent: 'Updated intent.',
      steps: [{ description: 'New step', imagePath: 'b.png', paragraph: 'New paragraph.' }],
    });
    const previous = fresh.replace(
      '<!-- Notes added here are preserved across regeneration. -->',
      'Keep me.',
    );
    const merged = applyKeepRegion(updated, previous);
    expect(merged).toContain('Updated intent.');
    expect(merged).toContain('New step');
    expect(extractKeepRegion(merged)).toBe('Keep me.');
  });
});
