import { describe, expect, it } from 'vitest';
import {
  applyKeepRegion,
  extractKeepRegion,
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
    expect(page).toContain('<details class="autodocs-viewport autodocs-viewport--mobile">');
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
    expect(page).toContain('<details class="autodocs-viewport autodocs-viewport--desktop">');
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
    const figureCount = (page.match(/<figure class="autodocs-figure">/g) ?? []).length;
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
    expect(page).not.toContain('autodocs-figure');
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

describe('RENDER_TEMPLATE_VERSION', () => {
  it('is exported as a stable integer other modules can hash', () => {
    expect(Number.isInteger(RENDER_TEMPLATE_VERSION)).toBe(true);
  });
});

describe('extractKeepRegion', () => {
  it('returns null when there is no keep-region', () => {
    expect(extractKeepRegion('# No keep region here')).toBeNull();
  });

  it('extracts trimmed content between the markers', () => {
    const md = '# Page\n\n<!-- autodocs:keep -->\n  Some human note.  \n<!-- /autodocs:keep -->\n';
    expect(extractKeepRegion(md)).toBe('Some human note.');
  });

  it('throws when the page has more than one keep-region', () => {
    const md =
      '# Page\n\n<!-- autodocs:keep -->\nFirst.\n<!-- /autodocs:keep -->\n\nMore text.\n\n' +
      '<!-- autodocs:keep -->\nSecond.\n<!-- /autodocs:keep -->\n';
    expect(() => extractKeepRegion(md)).toThrow(/only one is supported/);
  });
});

describe('nonKeepContent', () => {
  it('removes the entire keep-region block, markers included', () => {
    const md = '# Page\n\nBody text.\n\n<!-- autodocs:keep -->\nA human note.\n<!-- /autodocs:keep -->\n';
    const stripped = nonKeepContent(md);
    expect(stripped).toContain('# Page');
    expect(stripped).toContain('Body text.');
    expect(stripped).not.toContain('A human note.');
    expect(stripped).not.toContain('autodocs:keep');
  });

  it('is unaffected by changes to keep-region content alone', () => {
    const base = '# Page\n\nBody.\n\n<!-- autodocs:keep -->\n%NOTE%\n<!-- /autodocs:keep -->\n';
    const withNoteA = base.replace('%NOTE%', 'Note A');
    const withNoteB = base.replace('%NOTE%', 'Note B');
    expect(nonKeepContent(withNoteA)).toBe(nonKeepContent(withNoteB));
  });

  it('changes when body content outside the keep-region changes', () => {
    const md1 = '# Page\n\nBody one.\n\n<!-- autodocs:keep -->\nNote.\n<!-- /autodocs:keep -->\n';
    const md2 = '# Page\n\nBody two.\n\n<!-- autodocs:keep -->\nNote.\n<!-- /autodocs:keep -->\n';
    expect(nonKeepContent(md1)).not.toBe(nonKeepContent(md2));
  });

  it('throws when the page has more than one keep-region', () => {
    const md =
      '# Page\n\n<!-- autodocs:keep -->\nFirst.\n<!-- /autodocs:keep -->\n\nMore text.\n\n' +
      '<!-- autodocs:keep -->\nSecond.\n<!-- /autodocs:keep -->\n';
    expect(() => nonKeepContent(md)).toThrow(/only one is supported/);
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
