// Small, targeted edits to site/docusaurus.config.js for the app theme: the
// favicon, the navbar logo, and colorMode. A JS config can't be round-tripped
// safely, so each helper only touches the one recognizable construct and
// reports `applied: false` (with a reason) when it can't find it — the caller
// then tells the user what to set by hand instead of guessing.
// Values written here are already constrained by lib/app-theme.mjs
// (filename pattern, plain-text alt), and are additionally checked here.
const SAFE_PATH = /^img\/app-(favicon|logo)\.(png|jpe?g|webp|ico|svg)$/;
const SAFE_ALT = /^[A-Za-z0-9 .,&-]{1,60}$/; // no quote characters: it lands in a JS string

function findBlock(text, key) {
  const m = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*\\{`, 'm').exec(text);
  if (!m) return null;
  const open = text.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { open, close: i };
  }
  return null;
}

export function setFavicon(text, relPath) {
  if (!SAFE_PATH.test(relPath)) return { text, applied: false, reason: 'unsafe path' };
  const re = /(\bfavicon\s*:\s*)(['"])[^'"\n]*\2/;
  if (!re.test(text)) return { text, applied: false, reason: 'no `favicon:` setting found' };
  const next = text.replace(re, `$1'${relPath}'`);
  return { text: next, applied: true, changed: next !== text };
}

export function setNavbarLogo(text, { src, alt }) {
  if (!SAFE_PATH.test(src) || !SAFE_ALT.test(alt)) return { text, applied: false, reason: 'unsafe value' };
  const navbar = findBlock(text, 'navbar');
  if (!navbar) return { text, applied: false, reason: 'no `navbar:` block found' };
  const inner = text.slice(navbar.open, navbar.close + 1);
  const logo = findBlock(inner, 'logo');
  let nextInner;
  if (logo) {
    const logoText = `{ alt: '${alt}', src: '${src}' }`;
    nextInner = `${inner.slice(0, logo.open)}${logoText}${inner.slice(logo.close + 1)}`;
  } else {
    const titleLine = /^([ \t]*)title\s*:[^\n]*\n/m.exec(inner);
    if (!titleLine) return { text, applied: false, reason: 'no navbar `title:` to place the logo after' };
    const insertAt = titleLine.index + titleLine[0].length;
    const indent = titleLine[1];
    nextInner = `${inner.slice(0, insertAt)}${indent}logo: { alt: '${alt}', src: '${src}' },\n${inner.slice(insertAt)}`;
  }
  const next = `${text.slice(0, navbar.open)}${nextInner}${text.slice(navbar.close + 1)}`;
  return { text: next, applied: true, changed: next !== text };
}

export function setColorMode(text, { defaultMode, respectPrefersColorScheme }) {
  if (defaultMode !== undefined && !['light', 'dark'].includes(defaultMode)) return { text, applied: false, reason: 'unsafe value' };
  const block = findBlock(text, 'colorMode');
  const wanted = {};
  if (defaultMode !== undefined) wanted.defaultMode = `'${defaultMode}'`;
  if (respectPrefersColorScheme !== undefined) wanted.respectPrefersColorScheme = String(Boolean(respectPrefersColorScheme));
  if (!block) return { text, applied: false, reason: 'no `colorMode:` block found' };
  let inner = text.slice(block.open + 1, block.close);
  for (const [key, value] of Object.entries(wanted)) {
    const re = new RegExp(`(\\b${key}\\s*:\\s*)[^,\\n}]+`);
    if (re.test(inner)) inner = inner.replace(re, `$1${value}`);
    else {
      const indent = /\n([ \t]+)\S/.exec(inner)?.[1] ?? '  ';
      inner = `${inner.replace(/\s*$/, '')}${inner.trim() && !/,\s*$/.test(inner.trim()) ? ',' : ''}\n${indent}${key}: ${value},\n${indent.slice(0, -2)}`;
    }
  }
  const next = `${text.slice(0, block.open + 1)}${inner}${text.slice(block.close)}`;
  return { text: next, applied: true, changed: next !== text };
}
