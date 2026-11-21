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
const HSL_RE = /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let m = HEX_RE.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = HSL_RE.exec(s);
  if (m) {
    const h = (((parseFloat(m[1]) % 360) + 360) % 360) / 360;
    const sat = Math.min(100, parseFloat(m[2])) / 100;
    const l = Math.min(100, parseFloat(m[3])) / 100;
    if (![h, sat, l].every(Number.isFinite)) return null;
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!Number.isFinite(a) || a < 0 || a > 1) return null;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t) => {
      const x = (t + 1) % 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255, a };
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

const ASSET_FILE_RE = /^app-(favicon|logo)\.(png|jpe?g|webp|ico|svg)$/;

function cleanColors(c) {
  const colors = {
    background: cleanColor(c?.background),
    text: cleanColor(c?.text),
    heading: cleanColor(c?.heading),
    primary: cleanColor(c?.primary),
  };
  return Object.fromEntries(Object.entries(colors).filter(([, v]) => v));
}

// Alt text for a logo: plain words only (it's written into a JS config file).
export function sanitizeAlt(input) {
  const alt = String(input ?? '').replace(/[^A-Za-z0-9 .,&-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return alt || null;
}

// The only shape allowed to be stored in .docsolace/app-theme.json or turned
// into CSS. Used both on fresh extraction and when reading the file back (it is
// committed, so it is a hand-editable, untrusted input too).
export function validateTheme(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const theme = { colors: cleanColors(t.colors), fonts: {} };
  const body = sanitizeFontFamily(t.fonts?.body);
  const heading = sanitizeFontFamily(t.fonts?.heading);
  if (body) theme.fonts.body = body;
  if (heading) theme.fonts.heading = heading;
  const radius = sanitizeRadius(t.radius);
  if (radius) theme.radius = radius;
  const bg = parseColor(theme.colors.background);
  theme.scheme = bg ? (luminance(bg) > 0.5 ? 'light' : 'dark') : 'light';
  // The app's own dark variant (prefers-color-scheme: dark), when it has one.
  const dark = cleanColors(t.dark?.colors);
  if (Object.keys(dark).length > 0 && theme.scheme === 'light') theme.dark = { colors: dark };
  const assets = {};
  if (typeof t.assets?.favicon === 'string' && ASSET_FILE_RE.test(t.assets.favicon) && t.assets.favicon.startsWith('app-favicon')) {
    assets.favicon = t.assets.favicon;
  }
  const logo = t.assets?.logo;
  if (typeof logo?.file === 'string' && ASSET_FILE_RE.test(logo.file) && logo.file.startsWith('app-logo')) {
    assets.logo = { file: logo.file, alt: sanitizeAlt(logo.alt) ?? 'Logo' };
  }
  if (Object.keys(assets).length > 0) theme.assets = assets;
  return theme;
}

export const THEME_START = '/* docsolace:theme:start — generated from .docsolace/app-theme.json; edit that file, not this block */';
export const THEME_END = '/* docsolace:theme:end */';

// Docusaurus's own dark page color — the background an accent has to be
// readable on when the app has no dark theme of its own.
const DOCUSAURUS_DARK_BG = { r: 0x1b, g: 0x1b, b: 0x1d, a: 1 };

function accentDecls(primaryHex, background) {
  if (!primaryHex) return [];
  const accent = ensureContrast(parseColor(primaryHex), background);
  return Object.entries(deriveRamp(accent)).map(([suffix, c]) => `--ifm-color-primary${suffix}: ${toHex(c)};`);
}

function colorDecls(colors, background) {
  const out = accentDecls(colors.primary, background);
  if (colors.background) out.push(`--ifm-background-color: ${colors.background};`);
  if (colors.text) out.push(`--ifm-font-color-base: ${colors.text};`);
  if (colors.heading) out.push(`--ifm-heading-color: ${colors.heading};`);
  return out;
}

const rule = (selector, decls) => (decls.length ? `${selector} {\n${decls.map((d) => `  ${d}`).join('\n')}\n}\n` : '');

// What the generated CSS does per scheme:
//  - light app: its colors under :root. Its own dark variant (if any) under
//    [data-theme='dark']; otherwise just the accent, re-contrasted for
//    Docusaurus's dark page, so dark mode isn't left on the default green.
//  - dark-only app: its colors under [data-theme='dark'], accent for light.
// Fonts and corner radius are scheme-independent and live under :root.
export function buildThemeCss(themeInput) {
  const theme = validateTheme(themeInput);
  const root = [];
  if (theme.fonts.body) root.push(`--ifm-font-family-base: ${theme.fonts.body};`);
  if (theme.fonts.heading) root.push(`--ifm-heading-font-family: ${theme.fonts.heading};`);
  if (theme.radius) root.push(`--ifm-global-radius: ${theme.radius};`);

  const bg = parseColor(theme.colors.background);
  let dark;
  if (theme.scheme === 'dark') {
    dark = colorDecls(theme.colors, bg ?? DOCUSAURUS_DARK_BG);
    root.unshift(...accentDecls(theme.colors.primary, WHITE));
  } else {
    root.unshift(...colorDecls(theme.colors, bg ?? WHITE));
    dark = theme.dark
      ? colorDecls({ ...theme.dark.colors, primary: theme.dark.colors.primary ?? theme.colors.primary }, parseColor(theme.dark.colors.background) ?? DOCUSAURUS_DARK_BG)
      : accentDecls(theme.colors.primary, DOCUSAURUS_DARK_BG);
  }
  const body = `${rule(':root', root)}${rule("[data-theme='dark']", dark)}`;
  return body ? `${THEME_START}\n${body}${THEME_END}\n` : null;
}

// What, if anything, the site's colorMode setting should be so the docs open
// in the app's own mode. A light-only app needs no change.
export function colorModePlan(themeInput) {
  const theme = validateTheme(themeInput);
  if (theme.scheme === 'dark') return { defaultMode: 'dark', respectPrefersColorScheme: false };
  if (theme.dark) return { respectPrefersColorScheme: true };
  return null;
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

    const iconLink = document.querySelector('link[rel~="icon"]');
    const logoImg = [...document.querySelectorAll(
      'header img, nav img, [class*="logo" i] img, img[class*="logo" i], [class*="brand" i] img, img[alt*="logo" i]',
    )].find((img) => img.naturalWidth > 0 && img.currentSrc);
    return {
      assets: {
        favicon: iconLink ? iconLink.href : /^https?:/.test(location.href) ? new URL('/favicon.ico', location.href).href : null,
        logo: logoImg ? { src: logoImg.currentSrc, alt: logoImg.alt } : null,
      },
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

// Combines the app rendered under a light and under a dark color scheme. The
// app "has a dark theme" only when the two backgrounds genuinely differ, light
// is actually light and dark is actually dark; otherwise it is a single-scheme
// app (light, or dark-only) and the light-scheme read stands alone.
export function mergeSchemes(lightRaw, darkRaw) {
  const light = validateTheme(lightRaw);
  const dark = validateTheme(darkRaw);
  const lb = parseColor(light.colors.background);
  const db = parseColor(dark.colors.background);
  const hasDark = lb && db && luminance(lb) > 0.5 && luminance(db) < 0.5 && contrastRatio(lb, db) > 1.5;
  return hasDark ? { ...lightRaw, dark: { colors: darkRaw.colors } } : lightRaw;
}
