import { load as parseYaml } from 'js-yaml';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseFrontmatter(markdown) {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: markdown };
  return { frontmatter: parseYaml(match[1]) ?? {}, body: match[2] };
}

// Splits a space- or comma-separated tools string (as used in `tools`,
// `allowed-tools`, `disallowedTools`) into a list of entries, keeping any
// parenthesized scope (e.g. "Bash(npm run capture *)") intact as one entry.
export function parseToolList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim());
  return value.match(/[^\s,()]+(?:\([^)]*\))?/g) ?? [];
}
