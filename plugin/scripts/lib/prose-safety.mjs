// Deterministic checks on subagent-written prose before it reaches docs/.
// App copy, accessibility snapshots and repo files are untrusted input to the
// writing agents; a prompt-injected agent must not be able to publish active
// content or forge the markers the generator itself relies on. This is
// enforcement outside the model — the agent prompts also say so, but a prompt
// is not a boundary.
const RULES = [
  [/<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|base)\b/i, 'contains an active HTML tag'],
  [/\son[a-z]+\s*=/i, 'contains an HTML event-handler attribute'],
  [/\]\(\s*(javascript|data|vbscript):/i, 'contains a javascript:/data: link target'],
  [/<!--\s*\/?\s*docsolace:/i, 'contains a docsolace marker comment'],
];
const MAX_TOUR_PARAGRAPH = 4000;

// Returns a list of human-readable problems ([] when the text is fine).
// `tourParagraph` additionally forbids images and bare external links: a
// paragraph describes one screenshot and has no reason to link anywhere.
export function findUnsafeProse(text, { tourParagraph = false } = {}) {
  const problems = [];
  if (typeof text !== 'string') return ['is not a string'];
  for (const [re, message] of RULES) if (re.test(text)) problems.push(message);
  if (tourParagraph) {
    if (text.length > MAX_TOUR_PARAGRAPH) problems.push(`is longer than ${MAX_TOUR_PARAGRAPH} characters`);
    if (/!\[[^\]]*\]\(/.test(text)) problems.push('contains an image');
    if (/\]\(\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(text)) problems.push('links to an external URL');
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
