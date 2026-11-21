// Small, targeted edits to site/docusaurus.config.js for the app theme: the
// favicon, the navbar logo, and colorMode. A JS config can't be round-tripped
// safely, so each helper only touches one recognizable construct and reports
// `applied: false` (with a reason) when it can't find it — the caller then
// tells the user what to set by hand instead of guessing.
//
// Scanning runs on a *masked* copy of the file (comments and string contents
// blanked out, same length), so a commented-out `// favicon: ...` or a `}` inside
// a string can't be mistaken for code; edits are applied to the original text at
// the same indexes. Values written here are already constrained by
// lib/app-theme.mjs (filename pattern, plain-text alt) and re-checked here.
const SAFE_PATH = /^img\/app-(favicon|logo)\.(png|jpe?g|webp|ico|svg)$/;
const SAFE_ALT = /^[A-Za-z0-9 .,&-]{1,60}$/; // no quote characters: it lands in a JS string

// Blanks comments and string/template contents (quotes kept), preserving length
// and newlines so indexes line up with the original.
export function maskNonCode(text) {
  const out = text.split('');
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '/' && n === '/') {
      let j = i;
      while (j < text.length && text[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2);
      const j = end === -1 ? text.length : end + 2;
      blank(i, j);
      i = j;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      blank(i + 1, Math.min(j, text.length));
      i = j + 1;
    } else i++;
  }
  return out.join('');
}

// Index of the brace closing the one at `open`, on masked text.
function closeOf(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

// The `key: { ... }` object, found anywhere in code (not comments/strings).
function findBlock(masked, key) {
  const m = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*\\{`, 'm').exec(masked);
  if (!m) return null;
  const open = masked.indexOf('{', m.index + m[0].length - 1);
  const close = closeOf(masked, open);
  return close === -1 ? null : { open, close };
}

// A property of the object whose braces are at open..close, at that object's own
// top level only (not a same-named key nested deeper). Returns the value's span.
function findProp(masked, open, close, key) {
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    const c = masked[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (depth === 0 && masked.startsWith(key, i) && !/[\w$]/.test(masked[i - 1] ?? ' ')) {
      const after = /^\s*:\s*/.exec(masked.slice(i + key.length));
      if (!after) continue;
      const valueStart = i + key.length + after[0].length;
      let d = 0;
      let j = valueStart;
      for (; j < close; j++) {
        const ch = masked[j];
        if (ch === '{' || ch === '[' || ch === '(') d++;
        else if (ch === '}' || ch === ']' || ch === ')') d--;
        else if (ch === ',' && d === 0) break;
      }
      return { valueStart, valueEnd: j };
    }
  }
  return null;
}

// Sets `key: value` in the object at `block`: replaces the value in place, or
// inserts the property first (always valid JS, whatever the trailing commas).
function setProp(text, masked, block, key, value) {
  const prop = findProp(masked, block.open, block.close, key);
  if (prop) {
    const raw = text.slice(prop.valueStart, prop.valueEnd);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    return { text: `${text.slice(0, prop.valueStart + lead)}${value}${text.slice(prop.valueEnd - trail)}`, replaced: true };
  }
  const indent = /\n([ \t]+)\S/.exec(text.slice(block.open + 1, block.close))?.[1] ?? '  ';
  return { text: `${text.slice(0, block.open + 1)}\n${indent}${key}: ${value},${text.slice(block.open + 1)}`, replaced: false };
}

export function setFavicon(text, relPath) {
  if (!SAFE_PATH.test(relPath)) return { text, applied: false, reason: 'unsafe path' };
  const masked = maskNonCode(text);
  const m = /\bfavicon\s*:\s*(['"])/.exec(masked);
  if (!m) return { text, applied: false, reason: 'no `favicon:` setting found' };
  const quote = m[1];
  const open = m.index + m[0].length - 1;
  const close = masked.indexOf(quote, open + 1);
  if (close === -1) return { text, applied: false, reason: 'no `favicon:` setting found' };
  const next = `${text.slice(0, open)}'${relPath}'${text.slice(close + 1)}`;
  return { text: next, applied: true, changed: next !== text };
}

export function setNavbarLogo(text, { src, alt }) {
  if (!SAFE_PATH.test(src) || !SAFE_ALT.test(alt)) return { text, applied: false, reason: 'unsafe value' };
  const masked = maskNonCode(text);
  const navbar = findBlock(masked, 'navbar');
  if (!navbar) return { text, applied: false, reason: 'no `navbar:` block found' };
  const next = setProp(text, masked, navbar, 'logo', `{ alt: '${alt}', src: '${src}' }`).text;
  return { text: next, applied: true, changed: next !== text };
}

export function setColorMode(text, { defaultMode, respectPrefersColorScheme }) {
  if (defaultMode !== undefined && !['light', 'dark'].includes(defaultMode)) return { text, applied: false, reason: 'unsafe value' };
  let masked = maskNonCode(text);
  const block = findBlock(masked, 'colorMode');
  if (!block) return { text, applied: false, reason: 'no `colorMode:` block found' };
  let next = text;
  const wanted = [];
  if (defaultMode !== undefined) wanted.push(['defaultMode', `'${defaultMode}'`]);
  if (respectPrefersColorScheme !== undefined) wanted.push(['respectPrefersColorScheme', String(Boolean(respectPrefersColorScheme))]);
  for (const [key, value] of wanted) {
    masked = maskNonCode(next);
    const b = findBlock(masked, 'colorMode');
    next = setProp(next, masked, b, key, value).text;
  }
  return { text: next, applied: true, changed: next !== text };
}

// Undoes a previous dark-only setup when the app is light now: only flips
// values that are currently dark/false, and never adds a key that isn't there.
export function resetColorMode(text) {
  const masked = maskNonCode(text);
  const block = findBlock(masked, 'colorMode');
  if (!block) return { text, applied: false, reason: 'no `colorMode:` block found' };
  let next = text;
  const flip = (key, bad, good) => {
    const m2 = maskNonCode(next);
    const b = findBlock(m2, 'colorMode');
    const prop = findProp(m2, b.open, b.close, key);
    if (prop && next.slice(prop.valueStart, prop.valueEnd).trim() === bad) next = setProp(next, m2, b, key, good).text;
  };
  flip('defaultMode', "'dark'", "'light'");
  flip('respectPrefersColorScheme', 'false', 'true');
  return { text: next, applied: true, changed: next !== text };
}
