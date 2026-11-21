// Static fallback for theme-scan.mjs when the app isn't running: read the
// project's own CSS for the usual global declarations (:root custom
// properties, body/html color, background and font, h1 color). It is a
// heuristic over plain `.css` files — no preprocessor, no framework config —
// so it is labelled lower-confidence, and everything it finds still goes
// through validateTheme like a value read from a live page.
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const IGNORE = [
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**',
  'site/**', 'docs/**', '.docsolace/**', '**/*.min.css',
];
const MAX_FILES = 40;
const MAX_BYTES = 200 * 1024;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Removes every `@media` / `@supports` block (brace-matched): a dark, print or
// breakpoint override isn't the base theme. `@layer` is kept — Tailwind/shadcn
// put their base tokens there.
function stripDarkMedia(css) {
  const re = /@(?:media|supports)\b[^{]*\{/gi;
  let out = css;
  for (let m = re.exec(out); m; m = re.exec(out)) {
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < out.length; end++) {
      if (out[end] === '{') depth++;
      else if (out[end] === '}' && --depth === 0) break;
    }
    out = `${out.slice(0, m.index)}${out.slice(end + 1)}`;
    re.lastIndex = m.index;
  }
  return out;
}

function parseDecls(body) {
  const decls = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    decls[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return decls;
}

function resolveVars(value, vars, depth = 0) {
  if (typeof value !== 'string' || depth > 4) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, name, fallback) =>
    resolveVars(vars[name] ?? fallback ?? '', vars, depth + 1),
  );
}

const firstDefined = (vars, names) => names.map((n) => vars[n]).find((v) => v !== undefined);

// shadcn-style tokens store a bare HSL triplet ("221.2 83.2% 53.3%") that the
// stylesheet wraps in hsl(...) at the use site.
const asColor = (v) => (typeof v === 'string' && /^[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%$/.test(v.trim()) ? `hsl(${v.trim()})` : v);

function fontFromDecl(decls, vars) {
  if (decls['font-family']) return resolveVars(decls['font-family'], vars);
  const shorthand = resolveVars(decls.font ?? '', vars);
  const m = /[\d.]+(?:px|rem|em|%|pt)(?:\s*\/\s*[\d.]+(?:px|rem|em|%|pt)?)?\s+(.+)$/.exec(shorthand);
  return m ? m[1] : null;
}

function toPx(value) {
  const m = /^([\d.]+)(px|rem|em)$/.exec(String(value ?? '').trim());
  if (!m) return null;
  return `${(parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16)).toFixed(2).replace(/\.?0+$/, '')}px`;
}

const baseSelector = (sel) => sel.split(',').map((s) => s.trim());

export function extractThemeFromCss(cssText) {
  const css = stripDarkMedia(stripComments(String(cssText)));
  const vars = {};
  const body = {};
  const heading = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = baseSelector(m[1]);
    const decls = parseDecls(m[2]);
    const isRoot = selectors.some((s) => s === ':root' || s === 'html' || s === 'body');
    if (isRoot) {
      for (const [k, v] of Object.entries(decls)) {
        if (k.startsWith('--')) vars[k] = v;
        else body[k] = v;
      }
    }
    if (selectors.some((s) => /^h1$/i.test(s))) Object.assign(heading, decls);
  }

  const bgDecl = body['background-color'] ?? body.background;
  const primary = firstDefined(vars, ['--primary', '--color-primary', '--primary-color', '--brand', '--brand-color', '--accent', '--color-accent', '--accent-color']);
  const background = bgDecl ?? firstDefined(vars, ['--bg', '--background', '--color-bg', '--color-background', '--background-color']);
  const text = body.color ?? firstDefined(vars, ['--text', '--foreground', '--fg', '--color-text', '--text-color']);
  const headingColor = heading.color ?? firstDefined(vars, ['--text-h', '--heading', '--heading-color', '--color-heading']);
  const fontBody = fontFromDecl(body, vars) ?? firstDefined(vars, ['--sans', '--font-sans', '--font-family', '--font-body', '--font']);
  const radius = firstDefined(vars, ['--radius', '--radius-md', '--border-radius', '--rounded']);

  return {
    colors: {
      background: asColor(resolveVars(background, vars)),
      text: asColor(resolveVars(text, vars)),
      heading: asColor(resolveVars(headingColor, vars)),
      primary: asColor(resolveVars(primary, vars)),
    },
    fonts: { body: resolveVars(fontBody, vars), heading: heading['font-family'] ? resolveVars(heading['font-family'], vars) : null },
    radius: toPx(resolveVars(radius, vars)),
  };
}

// Merges per-field across the project's stylesheets, shallowest path first
// (a global index.css before a component's own file).
export function scanSourceTheme(cwd = process.cwd()) {
  const files = globSync('**/*.css', { cwd, ignore: IGNORE, nodir: true })
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .slice(0, MAX_FILES);
  const merged = { colors: {}, fonts: {}, radius: null };
  const used = [];
  for (const file of files) {
    let text;
    try {
      const full = path.join(cwd, file);
      if (fs.statSync(full).size > MAX_BYTES) continue;
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const t = extractThemeFromCss(text);
    let contributed = false;
    for (const [k, v] of Object.entries(t.colors)) if (v && !merged.colors[k]) (merged.colors[k] = v), (contributed = true);
    for (const [k, v] of Object.entries(t.fonts)) if (v && !merged.fonts[k]) (merged.fonts[k] = v), (contributed = true);
    if (t.radius && !merged.radius) (merged.radius = t.radius), (contributed = true);
    if (contributed) used.push(file);
  }
  return { theme: merged, files: used };
}
