import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateTheme } from '../app-theme.mjs';
import { extractThemeFromCss, scanSourceTheme } from '../source-theme.mjs';

const dirs = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('extractThemeFromCss', () => {
  it('reads :root custom properties and body font shorthand (the demo app shape)', () => {
    const t = validateTheme(extractThemeFromCss(`
      :root { --text: #374151; --text-h: #111827; --bg: #f9fafb; --primary: #2563eb;
              --sans: system-ui, 'Segoe UI', Roboto, sans-serif; --radius: 0.5rem;
              font: 16px/145% var(--sans); color: var(--text); background: var(--bg); }
    `));
    expect(t.colors).toMatchObject({ background: '#f9fafb', text: '#374151', heading: '#111827', primary: '#2563eb' });
    expect(t.fonts.body).toContain('system-ui');
    expect(t.radius).toBe('8px');
  });
  it('resolves shadcn-style hsl(var(--x)) triplets', () => {
    const t = validateTheme(extractThemeFromCss(`
      :root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; --primary: 221.2 83.2% 53.3%; }
      body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
      .btn { background: hsl(var(--primary)); }
    `));
    expect(t.colors.background).toBe('#ffffff');
    expect(t.colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.colors.text).toMatch(/^#0[0-9a-f]{5}$/);
  });
  it('ignores prefers-color-scheme: dark overrides and .dark selectors', () => {
    const t = validateTheme(extractThemeFromCss(`
      :root { --bg: #ffffff; --primary: #2563eb; }
      body { background: var(--bg); }
      @media (prefers-color-scheme: dark) { :root { --bg: #000000; --primary: #ff0000; } body { background: #000; } }
      .dark { --bg: #111; }
    `));
    expect(t.colors.background).toBe('#ffffff');
    expect(t.colors.primary).toBe('#2563eb');
  });
  it('picks up an h1 color and falls back through variable names', () => {
    const t = validateTheme(extractThemeFromCss('h1 { color: #112233; font-family: Georgia, serif } :root { --brand: #abcdef }'));
    expect(t.colors.heading).toBe('#112233');
    expect(t.colors.primary).toBe('#abcdef');
    expect(t.fonts.heading).toContain('Georgia');
  });
  it('lets hostile CSS values die in validateTheme', () => {
    const t = validateTheme(extractThemeFromCss(':root { --primary: red; } body { color: expression(alert(1)); background: url(javascript:x) }'));
    expect(t.colors).toEqual({});
  });
});

describe('scanSourceTheme', () => {
  it('merges across files, shallowest first, skipping node_modules/dist/site/docs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-src-'));
    dirs.push(dir);
    const w = (f, c) => {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), c);
    };
    w('src/index.css', ':root { --primary: #2563eb; }');
    w('src/pages/Login.css', ':root { --primary: #ff0000; --bg: #f9fafb; } body { background: var(--bg) }');
    w('node_modules/x/a.css', ':root { --primary: #00ff00; }');
    w('site/src/css/custom.css', ':root { --primary: #00ff00; }');
    w('docs/x.css', ':root { --primary: #00ff00; }');
    const { theme, files } = scanSourceTheme(dir);
    expect(validateTheme(theme).colors).toMatchObject({ primary: '#2563eb', background: '#f9fafb' });
    expect(files).toEqual(['src/index.css', 'src/pages/Login.css']);
  });
  it('finds nothing in an empty project', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsolace-src-'));
    dirs.push(dir);
    expect(scanSourceTheme(dir).files).toEqual([]);
  });
});
