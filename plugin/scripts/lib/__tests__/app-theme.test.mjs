import { chromium } from 'playwright';
import { describe, expect, it, afterAll } from 'vitest';
import {
  THEME_END, applyThemeBlock, buildThemeCss, contrastRatio, ensureContrast, extractThemeFromPage,
  parseColor, sanitizeFontFamily, sanitizeRadius, toHex, validateTheme,
} from '../app-theme.mjs';

describe('parseColor', () => {
  it('reads hex and rgb(a)', () => {
    expect(toHex(parseColor('#2563eb'))).toBe('#2563eb');
    expect(toHex(parseColor('#fff'))).toBe('#ffffff');
    expect(parseColor('rgb(37, 99, 235)')).toMatchObject({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)').a).toBe(0.5);
  });
  it('rejects anything else', () => {
    for (const bad of ['red', 'rgb(300,0,0)', 'url(x)', '#12', 'expression(1)', 'rgb(0,0,0); } body { x: y', null, 5]) {
      expect(parseColor(bad)).toBeNull();
    }
  });
});

describe('sanitizeFontFamily', () => {
  it('keeps ordinary families, quotes spaced names, adds a generic fallback', () => {
    expect(sanitizeFontFamily('system-ui, "Segoe UI", Roboto, sans-serif')).toBe('system-ui, "Segoe UI", Roboto, sans-serif');
    expect(sanitizeFontFamily('Inter')).toBe('Inter, system-ui, sans-serif');
  });
  it('cannot be used to break out of a CSS declaration', () => {
    const out = sanitizeFontFamily('Evil; } body { background: url(//x) } , Good');
    expect(out).toBe('Good, system-ui, sans-serif');
    expect(sanitizeFontFamily('a{b},c;d')).toBeNull();
    expect(sanitizeFontFamily('x'.repeat(100))).toBeNull();
    expect(sanitizeFontFamily(undefined)).toBeNull();
  });
});

describe('sanitizeRadius', () => {
  it('accepts small px values only', () => {
    expect(sanitizeRadius('6px')).toBe('6px');
    expect(sanitizeRadius('50%')).toBeNull();
    expect(sanitizeRadius('999px')).toBeNull();
    expect(sanitizeRadius('6px; color: red')).toBeNull();
  });
});

describe('contrast', () => {
  it('lifts a pale accent until it reads on a white page', () => {
    const white = parseColor('#ffffff');
    const pale = parseColor('#7aa7ff');
    expect(contrastRatio(pale, white)).toBeLessThan(4.5);
    expect(contrastRatio(ensureContrast(pale, white), white)).toBeGreaterThanOrEqual(4.5);
  });
  it('lightens instead on a dark page', () => {
    const dark = parseColor('#0b1020');
    const dim = parseColor('#1e3a8a');
    expect(contrastRatio(ensureContrast(dim, dark), dark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('validateTheme / buildThemeCss', () => {
  const theme = {
    colors: { background: '#f9fafb', text: '#374151', heading: '#111827', primary: '#2563eb' },
    fonts: { body: "system-ui, 'Segoe UI', Roboto, sans-serif" },
    radius: '8px',
  };
  it('emits Infima variables for a light app under :root', () => {
    const css = buildThemeCss(theme);
    expect(css).toContain(':root {');
    expect(css).toContain('--ifm-color-primary: #2563eb;');
    expect(css).toContain('--ifm-color-primary-darkest:');
    expect(css).toContain('--ifm-background-color: #f9fafb;');
    expect(css).toContain('--ifm-global-radius: 8px;');
    expect(css).toContain('--ifm-font-family-base: system-ui, "Segoe UI", Roboto, sans-serif;');
  });
  it('targets dark mode for a dark app', () => {
    const css = buildThemeCss({ ...theme, colors: { ...theme.colors, background: '#0b1020', text: '#e5e7eb' } });
    expect(css).toContain("[data-theme='dark'] {");
    expect(css).not.toContain(':root {');
  });
  it('drops hostile or invalid values instead of emitting them', () => {
    const css = buildThemeCss({
      colors: { background: 'red; } * { display:none', primary: '#2563eb' },
      fonts: { body: 'a{b}' },
      radius: '1e9px',
    });
    expect(css).not.toMatch(/display|\* \{|a\{b\}|1e9/);
    expect(css).toContain('--ifm-color-primary');
  });
  it('returns null when nothing is usable', () => {
    expect(buildThemeCss({ colors: { primary: 'nope' } })).toBeNull();
    expect(validateTheme(null)).toMatchObject({ colors: {}, fonts: {} });
  });
});

describe('applyThemeBlock', () => {
  const block = buildThemeCss({ colors: { primary: '#2563eb' } });
  it('appends once and replaces in place afterwards, leaving other rules alone', () => {
    const css = ':root { --x: 1; }\n.keep { color: red; }\n';
    const once = applyThemeBlock(css, block);
    expect(once).toContain('.keep { color: red; }');
    expect(once.split('docsolace:theme:start').length).toBe(2);
    expect(applyThemeBlock(once, block)).toBe(once);
    const next = buildThemeCss({ colors: { primary: '#dc2626' } });
    const swapped = applyThemeBlock(once, next);
    expect(swapped).toContain('#dc2626');
    expect(swapped).not.toContain('#2563eb');
    expect(swapped.split('docsolace:theme:start').length).toBe(2);
    expect(swapped).toContain('.keep { color: red; }');
    expect(swapped.endsWith(`${THEME_END}\n`) || swapped.includes(THEME_END)).toBe(true);
  });
});

let browser = null;
try {
  browser = await chromium.launch();
} catch {
  // no browser installed here
}
afterAll(async () => {
  await browser?.close();
});

describe.skipIf(!browser)('extractThemeFromPage (real browser)', () => {
  it("reads the app's background, text, accent, font and radius", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <style>
        body { background: #f9fafb; color: #374151; font-family: Georgia, serif; margin: 0 }
        h1 { color: #111827 }
        button { background: oklch(0.55 0.2 260); color: white; border-radius: 8px; border: 0 }
        a { color: #7c3aed }
      </style>
      <h1>Hello</h1><button>Go</button><button>Stop</button><a href="/x">link</a>`);
    const theme = validateTheme(await extractThemeFromPage(page));
    expect(theme.colors.background).toBe('#f9fafb');
    expect(theme.colors.text).toBe('#374151');
    expect(theme.colors.heading).toBe('#111827');
    expect(theme.colors.primary).toMatch(/^#[0-9a-f]{6}$/); // the two buttons outvote the link
    expect(theme.colors.primary).not.toBe('#7c3aed');
    expect(theme.fonts.body).toContain('Georgia');
    expect(theme.radius).toBe('8px');
    expect(theme.scheme).toBe('light');
    await page.close();
  });
});
