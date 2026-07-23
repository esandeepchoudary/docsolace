import { describe, expect, it } from 'vitest';
import { applyKeepRegion, extractKeepRegion, nonKeepContent, renderTourPage } from '../docgen.mjs';

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
  });

  it('labels each image by viewport when there is more than one', () => {
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
    expect(page).toContain('*desktop*');
    expect(page).toContain('![Step one (desktop)](a@desktop.png)');
    expect(page).toContain('*mobile*');
    expect(page).toContain('![Step one (mobile)](a@mobile.png)');
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
