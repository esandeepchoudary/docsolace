import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseToolList } from '../frontmatter.mjs';

describe('parseFrontmatter', () => {
  it('extracts YAML frontmatter and the remaining body', () => {
    const markdown = '---\nname: my-skill\ndescription: Does a thing\n---\nBody text here.\n';
    const { frontmatter, body } = parseFrontmatter(markdown);
    expect(frontmatter).toEqual({ name: 'my-skill', description: 'Does a thing' });
    expect(body.trim()).toBe('Body text here.');
  });

  it('returns an empty frontmatter object when there is none', () => {
    const { frontmatter, body } = parseFrontmatter('Just a body, no frontmatter.');
    expect(frontmatter).toEqual({});
    expect(body).toBe('Just a body, no frontmatter.');
  });
});

describe('parseToolList', () => {
  it('splits a comma-separated string', () => {
    expect(parseToolList('Read, Write')).toEqual(['Read', 'Write']);
  });

  it('keeps parenthesized scopes intact as one entry', () => {
    expect(parseToolList('Bash(npm run capture *) Bash(npm run drift *)')).toEqual([
      'Bash(npm run capture *)',
      'Bash(npm run drift *)',
    ]);
  });

  it('returns an empty array for undefined', () => {
    expect(parseToolList(undefined)).toEqual([]);
  });

  it('passes through a YAML list unchanged', () => {
    expect(parseToolList(['Read', 'Write'])).toEqual(['Read', 'Write']);
  });
});
