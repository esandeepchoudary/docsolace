import { describe, expect, it } from 'vitest';
import { setColorMode, setFavicon, setNavbarLogo } from '../site-config.mjs';

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
    expect(r.text).toMatch(/navbar: \{\n\s+title: 'My Site',\n\s+logo: \{ alt: 'Acme', src: 'img\/app-logo.png' \},/);
    expect(() => new Function(`${r.text.replace('const config', 'var config')}; return config;`)()).not.toThrow();
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
