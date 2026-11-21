import { describe, expect, it } from 'vitest';
import { maskNonCode, resetColorMode, setColorMode, setFavicon, setNavbarLogo } from '../site-config.mjs';

const evalConfig = (text) => new Function(`${text.replace(/^const config/m, 'var config')}; return config;`)();

const config = `const config = {
  title: 'My Site',
  favicon: 'img/favicon.ico',
  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'My Site',
      items: [{ type: 'docSidebar', label: 'Docs' }],
    },
  },
};
`;

describe('setFavicon', () => {
  it('replaces the favicon value only', () => {
    const r = setFavicon(config, 'img/app-favicon.png');
    expect(r.applied).toBe(true);
    expect(r.text).toContain("favicon: 'img/app-favicon.png'");
    expect(r.text).toContain("title: 'My Site'");
  });
  it('reports when there is no favicon setting, and refuses unsafe paths', () => {
    expect(setFavicon('const a = 1;', 'img/app-favicon.png').applied).toBe(false);
    expect(setFavicon(config, "img/x'; evil(); '").applied).toBe(false);
    expect(setFavicon(config, '../../etc/passwd').applied).toBe(false);
  });
});

describe('setNavbarLogo', () => {
  it('inserts a logo after the navbar title', () => {
    const r = setNavbarLogo(config, { src: 'img/app-logo.png', alt: 'Acme' });
    expect(r.applied).toBe(true);
    expect(evalConfig(r.text).themeConfig.navbar.logo).toEqual({ alt: 'Acme', src: 'img/app-logo.png' });
    expect(evalConfig(r.text).themeConfig.navbar.title).toBe('My Site');
  });
  it('replaces an existing logo and is idempotent', () => {
    const once = setNavbarLogo(config, { src: 'img/app-logo.png', alt: 'Acme' }).text;
    const twice = setNavbarLogo(once, { src: 'img/app-logo.svg', alt: 'Acme' });
    expect(twice.text).toContain("src: 'img/app-logo.svg'");
    expect(twice.text.match(/logo:/g)).toHaveLength(1);
    expect(setNavbarLogo(twice.text, { src: 'img/app-logo.svg', alt: 'Acme' }).changed).toBe(false);
  });
  it('refuses unsafe values and a config without a navbar', () => {
    expect(setNavbarLogo(config, { src: 'img/app-logo.png', alt: "x'}); evil(" }).applied).toBe(false);
    expect(setNavbarLogo(config, { src: 'https://evil/x.png', alt: 'x' }).applied).toBe(false);
    expect(setNavbarLogo('module.exports = {};', { src: 'img/app-logo.png', alt: 'x' }).applied).toBe(false);
  });
});

describe('setColorMode', () => {
  it('sets defaultMode and respectPrefersColorScheme in the existing block, producing valid JS', () => {
    const r = setColorMode(config, { defaultMode: 'dark', respectPrefersColorScheme: false });
    expect(r.applied).toBe(true);
    expect(r.text).toMatch(/respectPrefersColorScheme: false/);
    expect(r.text).toMatch(/defaultMode: 'dark'/);
    expect(() => new Function(`${r.text.replace('const config', 'var config')}; return config;`)()).not.toThrow();
  });
  it('updates in place when already present, and is idempotent', () => {
    const once = setColorMode(config, { respectPrefersColorScheme: true });
    expect(once.changed).toBe(false);
    const d = setColorMode(config, { defaultMode: 'dark' }).text;
    const d2 = setColorMode(d, { defaultMode: 'dark' });
    expect(d2.changed).toBe(false);
    expect(d2.text.match(/defaultMode/g)).toHaveLength(1);
  });
  it('reports a missing block and refuses unsafe values', () => {
    expect(setColorMode('const c = {};', { defaultMode: 'dark' }).applied).toBe(false);
    expect(setColorMode(config, { defaultMode: "dark'; evil(); '" }).applied).toBe(false);
  });
});

describe('robust against hand-written configs', () => {
  it('maskNonCode blanks comments and strings but keeps length and braces', () => {
    const src = "a { // favicon: 'x'\n b: '}{' } /* colorMode: { */";
    const m = maskNonCode(src);
    expect(m).toHaveLength(src.length);
    expect(m).not.toContain('favicon');
    expect(m.match(/[{}]/g)).toHaveLength(2);
  });

  it('edits the live favicon, not a commented-out one', () => {
    const text = "// favicon: 'img/old.ico',\nconst config = {\n  favicon: 'img/favicon.ico',\n};\n";
    const r = setFavicon(text, 'img/app-favicon.png');
    expect(r.text).toContain("// favicon: 'img/old.ico',");
    expect(r.text).toContain("favicon: 'img/app-favicon.png'");
    expect(setFavicon("// favicon: 'img/old.ico'\nconst config = {};", 'img/app-favicon.png').applied).toBe(false);
  });

  it('ignores a colorMode/navbar that only appears in a comment or string', () => {
    const text = "// colorMode: { defaultMode: 'light' }\nconst config = { note: 'navbar: { }' };\n";
    expect(setColorMode(text, { defaultMode: 'dark' }).applied).toBe(false);
    expect(setNavbarLogo(text, { src: 'img/app-logo.png', alt: 'x' }).applied).toBe(false);
  });

  it('produces valid JS when the navbar title has no trailing comma or the block is empty', () => {
    const noComma = "const config = {\n  themeConfig: {\n    navbar: {\n      title: 'Docs'\n    },\n  },\n};\n";
    expect(evalConfig(setNavbarLogo(noComma, { src: 'img/app-logo.png', alt: 'A' }).text).themeConfig.navbar.logo.src).toBe('img/app-logo.png');
    const empty = "const config = { themeConfig: { navbar: {}, colorMode: {} } };\n";
    expect(evalConfig(setNavbarLogo(empty, { src: 'img/app-logo.png', alt: 'A' }).text).themeConfig.navbar.logo.alt).toBe('A');
    const cm = evalConfig(setColorMode(empty, { defaultMode: 'dark', respectPrefersColorScheme: false }).text).themeConfig.colorMode;
    expect(cm).toEqual({ defaultMode: 'dark', respectPrefersColorScheme: false });
  });

  it('only touches the navbar\'s own logo, not a nested one in items', () => {
    const text = "const config = { themeConfig: { navbar: { title: 'T', items: [{ logo: { src: 'keep' } }] } } };\n";
    const out = evalConfig(setNavbarLogo(text, { src: 'img/app-logo.png', alt: 'A' }).text).themeConfig.navbar;
    expect(out.logo.src).toBe('img/app-logo.png');
    expect(out.items[0].logo.src).toBe('keep');
  });

  it('a } inside a string does not end the block early', () => {
    const text = "const config = { themeConfig: { navbar: { title: 'a } b', items: [] } } };\n";
    const out = evalConfig(setNavbarLogo(text, { src: 'img/app-logo.png', alt: 'A' }).text).themeConfig.navbar;
    expect(out.title).toBe('a } b');
    expect(out.logo.alt).toBe('A');
  });
});

describe('resetColorMode', () => {
  it('undoes a dark-only setup, leaves everything else, adds nothing', () => {
    const dark = "const config = { themeConfig: { colorMode: { defaultMode: 'dark', respectPrefersColorScheme: false } } };\n";
    expect(evalConfig(resetColorMode(dark).text).themeConfig.colorMode).toEqual({ defaultMode: 'light', respectPrefersColorScheme: true });
    const plain = "const config = { themeConfig: { colorMode: { respectPrefersColorScheme: true } } };\n";
    const r = resetColorMode(plain);
    expect(r.changed).toBe(false);
    expect(r.text).toBe(plain);
  });
});
