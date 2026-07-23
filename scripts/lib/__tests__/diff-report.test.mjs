import { describe, expect, it } from 'vitest';
import { renderDiffReport } from '../diff-report.mjs';

describe('renderDiffReport', () => {
  it('renders a message when there are no entries', () => {
    const html = renderDiffReport([]);
    expect(html).toContain('No pending screenshot changes to review.');
    expect(html).toContain('0 changes pending');
  });

  it('renders one section per entry with before/after/diff images', () => {
    const html = renderDiffReport([
      {
        tourId: 'dashboard-overview',
        capture: 'dashboard-full',
        viewport: 'desktop',
        beforePath: 'diffs/dashboard-overview/dashboard-full@desktop.before.png',
        afterPath: 'images/dashboard-overview/dashboard-full@desktop.png',
        diffPath: 'diffs/dashboard-overview/dashboard-full@desktop.diff.png',
      },
    ]);
    expect(html).toContain('dashboard-overview');
    expect(html).toContain('dashboard-full');
    expect(html).toContain('(desktop)');
    expect(html).toContain('src="diffs/dashboard-overview/dashboard-full@desktop.before.png"');
    expect(html).toContain('src="images/dashboard-overview/dashboard-full@desktop.png"');
    expect(html).toContain('src="diffs/dashboard-overview/dashboard-full@desktop.diff.png"');
    expect(html).toContain('1 change pending');
  });

  it('escapes HTML-significant characters in entry fields', () => {
    const html = renderDiffReport([
      {
        tourId: '<script>alert(1)</script>',
        capture: 'x',
        viewport: 'desktop',
        beforePath: 'a.png',
        afterPath: 'b.png',
        diffPath: 'c.png',
      },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
