// Derives the docs site's look from the running app, so published tutorials
// resemble the product they document. Presentation only — never content, same
// guardrail as lib/design.mjs: this feeds the Docusaurus theme (colors, fonts,
// corner radius) and nothing a doc-scribe writes.
//
// Everything read out of the app is untrusted: it ends up inside a CSS file,
// so every value is re-parsed into a closed set of shapes (a hex color, a
// plain font-family list, a small px radius) before it is stored or emitted.
// Anything that doesn't parse is dropped, never passed through.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let m = HEX_RE.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = RGB_RE.exec(s);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  if ([r, g, b].some((n) => n > 255)) return null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (!Number.isFinite(a) || a < 0 || a > 1) return null;
  return { r, g, b, a };
}

export function toHex({ r, g, b }) {
  const h = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function saturation({ r, g, b }) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

export function mix(color, target, amount) {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
    a: 1,
  };
}

const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const WHITE = { r: 255, g: 255, b: 255, a: 1 };

// Nudges a brand color until it is readable as link/accent text on the page
// background (WCAG AA, 4.5:1) — an app's button color is often tuned for white
// text on it, not for use as text on its own background.
export function ensureContrast(color, background, min = 4.5) {
  const towards = luminance(background) > 0.5 ? BLACK : WHITE;
  let out = color;
  for (let i = 0; i < 25 && contrastRatio(out, background) < min; i++) out = mix(out, towards, 0.06);
  return out;
}

// Infima's seven-step primary ramp, derived from one color.
export function deriveRamp(primary) {
  return {
    '': primary,
    '-dark': mix(primary, BLACK, 0.1),
    '-darker': mix(primary, BLACK, 0.17),
    '-darkest': mix(primary, BLACK, 0.35),
    '-light': mix(primary, WHITE, 0.1),
    '-lighter': mix(primary, WHITE, 0.17),
    '-lightest': mix(primary, WHITE, 0.3),
  };
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded']);

// A font-family list, rebuilt from allowed characters only (letters, digits,
// space, hyphen, underscore) so nothing from the page can break out of a CSS
// declaration. Returns null when nothing usable remains.
export function sanitizeFontFamily(input) {
  if (typeof input !== 'string') return null;
  const families = [];
  for (const raw of input.split(',')) {
    const name = raw.replace(/["']/g, '').trim();
    if (!name || name.length > 40 || !/^[A-Za-z0-9 _-]+$/.test(name)) continue;
    families.push(GENERIC_FAMILIES.has(name.toLowerCase()) || !/\s/.test(name) ? name : `"${name}"`);
    if (families.length === 4) break;
  }
  if (families.length === 0) return null;
  if (!families.some((f) => GENERIC_FAMILIES.has(f.toLowerCase()))) families.push('system-ui', 'sans-serif');
  return families.join(', ');
}

export function sanitizeRadius(input) {
  const m = /^(\d{1,2}(?:\.\d{1,2})?)px$/.exec(String(input ?? '').trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n >= 0 && n <= 24 ? `${n}px` : null;
}

function cleanColor(value, { opaqueOnly = true } = {}) {
  const c = parseColor(value);
  if (!c || (opaqueOnly && c.a < 0.95)) return null;
  return toHex(c);
}

// The only shape allowed to be stored in .docsolace/app-theme.json or turned
// into CSS. Used both on fresh extraction and when reading the file back (it is
// committed, so it is a hand-editable, untrusted input too).
export function validateTheme(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const colors = {
    background: cleanColor(t.colors?.background),
    text: cleanColor(t.colors?.text),
    heading: cleanColor(t.colors?.heading),
    primary: cleanColor(t.colors?.primary),
  };
  const theme = {
    colors: Object.fromEntries(Object.entries(colors).filter(([, v]) => v)),
    fonts: {},
  };
  const body = sanitizeFontFamily(t.fonts?.body);
  const heading = sanitizeFontFamily(t.fonts?.heading);
  if (body) theme.fonts.body = body;
  if (heading) theme.fonts.heading = heading;
  const radius = sanitizeRadius(t.radius);
  if (radius) theme.radius = radius;
  const bg = parseColor(theme.colors.background);
  theme.scheme = bg ? (luminance(bg) > 0.5 ? 'light' : 'dark') : 'light';
  return theme;
}

export const THEME_START = '/* docsolace:theme:start — generated from .docsolace/app-theme.json; edit that file, not this block */';
export const THEME_END = '/* docsolace:theme:end */';

export function buildThemeCss(themeInput) {
  const theme = validateTheme(themeInput);
  const decls = [];
  const bg = parseColor(theme.colors.background);
  if (theme.colors.primary) {
    const base = parseColor(theme.colors.primary);
    // Accent must read on the page background; fall back to white/black if the
    // app has no usable background color.
    const accent = ensureContrast(base, bg ?? WHITE);
    for (const [suffix, c] of Object.entries(deriveRamp(accent))) decls.push(`--ifm-color-primary${suffix}: ${toHex(c)};`);
  }
  if (theme.colors.background) decls.push(`--ifm-background-color: ${theme.colors.background};`);
  if (theme.colors.text) decls.push(`--ifm-font-color-base: ${theme.colors.text};`);
  if (theme.colors.heading) decls.push(`--ifm-heading-color: ${theme.colors.heading};`);
  if (theme.fonts.body) decls.push(`--ifm-font-family-base: ${theme.fonts.body};`);
  if (theme.fonts.heading) decls.push(`--ifm-heading-font-family: ${theme.fonts.heading};`);
  if (theme.radius) decls.push(`--ifm-global-radius: ${theme.radius};`);
  if (decls.length === 0) return null;
  // A dark app styles Docusaurus's dark mode; a light one styles the default.
  const selector = theme.scheme === 'dark' ? "[data-theme='dark']" : ':root';
  return `${THEME_START}\n${selector} {\n${decls.map((d) => `  ${d}`).join('\n')}\n}\n${THEME_END}\n`;
}

// Replaces the generated block in place (or appends it), leaving every other
// rule in the file untouched, so re-running is idempotent.
export function applyThemeBlock(css, block) {
  const start = css.indexOf('/* docsolace:theme:start');
  const end = css.indexOf(THEME_END);
  if (start !== -1 && end !== -1 && end > start) {
    const after = end + THEME_END.length;
    return `${css.slice(0, start)}${block.trimEnd()}${css.slice(after).replace(/^\n?/, '\n')}`;
  }
  return `${css.trimEnd()}\n\n${block}`;
}

// Reads the app's look out of a live Playwright page. Returns raw strings; the
// caller runs them through validateTheme.
export async function extractThemeFromPage(page) {
  return page.evaluate(() => {
    // Resolve any CSS color (oklch, hsl, named, color-mix...) to real sRGB by
    // painting one pixel and reading it back — canvas.fillStyle alone returns
    // modern color spaces as-is. An unparseable value is detected by the
    // fillStyle staying put across two different sentinels.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const norm = (value) => {
      if (!value) return null;
      ctx.fillStyle = '#000001';
      ctx.fillStyle = value;
      const first = ctx.fillStyle;
      ctx.fillStyle = '#fffffe';
      ctx.fillStyle = value;
      if (first !== ctx.fillStyle) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return null;
      const h = (n) => n.toString(16).padStart(2, '0');
      return a === 255 ? `#${h(r)}${h(g)}${h(b)}` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
    };
    const cs = (el) => getComputedStyle(el);
    const solid = (v) => norm(v);
    const sat = (hexOrRgb) => {
      const m = /#([0-9a-f]{6})/i.exec(hexOrRgb) ?? [];
      if (!m[1]) return 0;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    };

    const body = document.body;
    const background = solid(cs(body).backgroundColor) ?? solid(cs(document.documentElement).backgroundColor);
    const heading = document.querySelector('h1, h2, h3');
    const votes = new Map();
    const vote = (color, weight) => {
      if (color && sat(color) > 0.25) votes.set(color, (votes.get(color) ?? 0) + weight);
    };
    for (const el of document.querySelectorAll('button, [role=button], input[type=submit]')) vote(solid(cs(el).backgroundColor), 3);
    for (const el of document.querySelectorAll('a[href]')) vote(solid(cs(el).color), 1);
    const primary = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const control = document.querySelector('button, input, select');

    return {
      colors: {
        background,
        text: solid(cs(body).color),
        heading: heading ? solid(cs(heading).color) : null,
        primary,
      },
      fonts: { body: cs(body).fontFamily, heading: heading ? cs(heading).fontFamily : null },
      radius: control ? cs(control).borderTopLeftRadius : null,
    };
  });
}
