// Deterministic checks on subagent-written prose before it reaches docs/.
// App copy, accessibility snapshots and repo files are untrusted input to the
// writing agents; a prompt-injected agent must not be able to publish active
// content or forge the markers the generator itself relies on. This is
// enforcement outside the model — the agent prompts also say so, but a prompt
// is not a boundary.
//
// It is a denylist over the *rendered* text, so it first normalizes the ways
// markdown/HTML let the same thing be spelled: HTML entities are decoded, and
// code (fenced blocks and inline spans) is set aside — documentation may
// legitimately talk about `<form>` or `onClick=`, which render as inert text.
const ACTIVE_TAG = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|base|svg|math|video|audio|source|frame|frameset)\b/i;
const EVENT_HANDLER = /[\s/"'`]on[a-z]+\s*=/i;
// A dangerous scheme as a link/attribute target: after `](`, a `[ref]:`
// definition, or href/src/action. Whitespace and control characters are
// removed first because browsers ignore them inside a scheme.
const DANGEROUS_TARGET = /(?:\]\(|\]:|href=|src=|action=|formaction=|xlink:href=|data=)["'`]?(?:javascript|data|vbscript):/i;
const MARKER = /<!--\s*\/?\s*docsolace:/i;
// The generator's keep-region regex (lib/docgen.mjs) only matches a marker alone
// on its line, so that is the form that could hijack a region — even inside a
// fenced example. A marker named inline in a sentence cannot match.
const MARKER_ON_OWN_LINE = /^[ \t]*<!--\s*\/?\s*docsolace:[^>]*-->[ \t]*$/im;
const MAX_TOUR_PARAGRAPH = 4000;

const NAMED_ENTITIES = { colon: ':', tab: '\t', newline: '\n', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', sol: '/', lpar: '(', rpar: ')', equals: '=' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function stripCode(text) {
  const kept = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1];
      else if (m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    kept.push(fence ? '' : line);
  }
  return kept.join('\n').replace(/(`+)[^`\n]*?\1/g, ' ');
}

// Returns a list of human-readable problems ([] when the text is fine).
// `tourParagraph` additionally forbids images and bare external links: a
// paragraph describes one screenshot and has no reason to link anywhere.
export function findUnsafeProse(text, { tourParagraph = false } = {}) {
  if (typeof text !== 'string') return ['is not a string'];
  const problems = [];
  // Decoded twice so `&amp;#106;` can't hide a character behind two layers.
  const decoded = decodeEntities(decodeEntities(text));
  const outsideCode = stripCode(decoded);
  // A marker outside code is a hidden comment; one alone on its line (even in
  // a fence) could be matched by the generator as a keep region of its own.
  // Naming a marker inline in a sentence, in code, is just documentation.
  if (MARKER.test(outsideCode) || MARKER_ON_OWN_LINE.test(decoded)) problems.push('contains a docsolace marker comment');
  if (ACTIVE_TAG.test(outsideCode)) problems.push('contains an active HTML tag');
  if (EVENT_HANDLER.test(outsideCode)) problems.push('contains an HTML event-handler attribute');
  if (DANGEROUS_TARGET.test(outsideCode.replace(/[\u0000-\u0020\u00a0]/g, ''))) {
    problems.push('contains a javascript:/data: link target');
  }
  if (tourParagraph) {
    if (text.length > MAX_TOUR_PARAGRAPH) problems.push(`is longer than ${MAX_TOUR_PARAGRAPH} characters`);
    if (/!\[[^\]]*\]\(/.test(outsideCode)) problems.push('contains an image');
    if (/\]\(\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(outsideCode)) problems.push('links to an external URL');
  }
  return problems;
}

export function assertSafeTourProse(paragraphs, tourId) {
  for (const [capture, text] of Object.entries(paragraphs ?? {})) {
    const problems = findUnsafeProse(text, { tourParagraph: true });
    if (problems.length > 0) {
      throw new Error(`Prose for "${tourId}" capture "${capture}" was rejected: it ${problems.join('; ')}.`);
    }
  }
}

// Product prose is nested (page id -> sections -> strings); walk every string.
export function assertSafeProductProse(value, label = '_product') {
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const problems = findUnsafeProse(v);
      if (problems.length > 0) throw new Error(`Product prose at ${where} was rejected: it ${problems.join('; ')}.`);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${where}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v)) walk(item, `${where}.${k}`);
    }
  };
  walk(value, label);
}
