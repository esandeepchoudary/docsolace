import { describe, expect, it } from 'vitest';
import { applyArchiveBanner, archivePaths, buildArchiveBanner, buildCategoryJson } from '../archive.mjs';

describe('buildArchiveBanner / applyArchiveBanner', () => {
  it('prepends the banner above the page content', () => {
    const markdown = '# Export dashboard activity\n\nShow how to export.\n';
    const result = applyArchiveBanner(markdown);
    expect(result.startsWith('<!-- autodocs:archived -->')).toBe(true);
    expect(result).toContain('# Export dashboard activity');
    expect(result.indexOf('<!-- autodocs:archived -->')).toBeLessThan(result.indexOf('# Export dashboard activity'));
  });

  it('is idempotent — re-applying to an already-banner-ed page changes nothing', () => {
    const markdown = '# Title\n\nBody.\n';
    const once = applyArchiveBanner(markdown);
    const twice = applyArchiveBanner(once);
    expect(twice).toBe(once);
  });

  it('banner text explains the page will not be updated further', () => {
    expect(buildArchiveBanner().toLowerCase()).toContain('archived');
    expect(buildArchiveBanner().toLowerCase()).toContain('not be updated further');
  });
});

describe('archivePaths', () => {
  it('moves doc + images under docs/archive/, preserving the images/<id>/ relative structure', () => {
    const paths = archivePaths('dashboard-export');
    expect(paths.docFrom).toBe('docs/dashboard-export.md');
    expect(paths.docTo).toBe('docs/archive/dashboard-export.md');
    expect(paths.imagesFrom).toBe('docs/images/dashboard-export');
    expect(paths.imagesTo).toBe('docs/archive/images/dashboard-export');
    expect(paths.archiveDir).toBe('docs/archive');
  });

  it('respects a custom docsDir', () => {
    const paths = archivePaths('login', { docsDir: 'output' });
    expect(paths.docFrom).toBe('output/login.md');
    expect(paths.docTo).toBe('output/archive/login.md');
  });
});

describe('buildCategoryJson', () => {
  it('produces valid JSON with a label and a low sidebar priority (sinks to the bottom)', () => {
    const parsed = JSON.parse(buildCategoryJson());
    expect(parsed.label).toBe('Archive');
    expect(parsed.position).toBeGreaterThan(0);
  });
});
