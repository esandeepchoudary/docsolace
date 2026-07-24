import { describe, expect, it, vi } from 'vitest';
import { crawl, isLogoutLink, isSameOrigin, planSafeInteractions } from '../crawl.mjs';

describe('isSameOrigin', () => {
  const baseOrigin = 'http://localhost:3000';

  it('accepts a same-origin relative link', () => {
    expect(isSameOrigin('/about', baseOrigin)).toBe(true);
  });

  it('rejects an absolute external link', () => {
    expect(isSameOrigin('https://evil.example/phish', baseOrigin)).toBe(false);
  });

  it('rejects a protocol-relative link', () => {
    expect(isSameOrigin('//evil.example', baseOrigin)).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isSameOrigin('mailto:a@b.com', baseOrigin)).toBe(false);
    expect(isSameOrigin('tel:+15550100', baseOrigin)).toBe(false);
    expect(isSameOrigin('javascript:alert(1)', baseOrigin)).toBe(false);
  });

  it('rejects a garbage href', () => {
    expect(isSameOrigin(undefined, baseOrigin)).toBe(false);
    expect(isSameOrigin('', baseOrigin)).toBe(false);
  });
});

describe('isLogoutLink', () => {
  it('flags common logout hrefs/text', () => {
    expect(isLogoutLink('/logout', 'Log out')).toBe(true);
    expect(isLogoutLink('/auth/signout', 'Sign out')).toBe(true);
    expect(isLogoutLink('/session/end', 'logout')).toBe(true);
  });

  it('does not flag an unrelated link', () => {
    expect(isLogoutLink('/about', 'About')).toBe(false);
  });
});

describe('planSafeInteractions', () => {
  it('excludes a whole form when any field is sensitive', () => {
    const pageData = {
      forms: [{ index: 0, inputs: [{ index: 0, name: 'Password', type: 'password' }], submitText: 'Login' }],
      buttons: [],
    };
    expect(planSafeInteractions(pageData)).toEqual([]);
  });

  it('excludes a form whose submit control reads as destructive', () => {
    const pageData = {
      forms: [{ index: 0, inputs: [{ index: 0, name: 'Reason', type: 'text' }], submitText: 'Delete account' }],
      buttons: [],
    };
    expect(planSafeInteractions(pageData)).toEqual([]);
  });

  it('plans a safe form with synthetic values', () => {
    const pageData = {
      forms: [{ index: 0, inputs: [{ index: 0, name: 'Email', type: 'email' }], submitText: 'Search' }],
      buttons: [],
    };
    expect(planSafeInteractions(pageData)).toEqual([
      {
        type: 'submitForm',
        formIndex: 0,
        fields: [{ index: 0, type: 'email', value: 'user@example.com' }],
        submitText: 'Search',
      },
    ]);
  });

  it('excludes a destructive button but plans a safe one', () => {
    const pageData = {
      forms: [],
      buttons: [
        { index: 0, text: 'Show more' },
        { index: 1, text: 'Delete account' },
      ],
    };
    expect(planSafeInteractions(pageData)).toEqual([{ type: 'click', buttonIndex: 0, text: 'Show more' }]);
  });
});

// A fake Playwright-shaped page: goto() tracks the "current" route, and
// evaluate() returns whatever canned data was registered for that route —
// enough surface for crawl()'s BFS/interaction logic without a real browser.
function makeFakePage(pageDataByRoute) {
  let currentUrl = null;
  let currentRoute = null;
  const locatorCalls = [];
  const chainable = {
    fill: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    locator: () => ({ nth: () => ({ getAttribute: vi.fn().mockResolvedValue(null) }) }),
  };
  const page = {
    async goto(url) {
      currentUrl = url;
      currentRoute = new URL(url).pathname + new URL(url).search;
    },
    async evaluate() {
      return pageDataByRoute[currentRoute] ?? { title: '', links: [], forms: [], buttons: [] };
    },
    async waitForLoadState() {},
    url() {
      return currentUrl;
    },
    locator(selector) {
      locatorCalls.push(selector);
      return chainable;
    },
  };
  return { page, locatorCalls };
}

describe('crawl', () => {
  const baseUrl = 'http://localhost:3000';

  it('follows same-origin links breadth-first and excludes logout/external/non-http links', async () => {
    const { page } = makeFakePage({
      '/': {
        title: 'Home',
        links: [
          { href: '/about', text: 'About' },
          { href: '/logout', text: 'Logout' },
          { href: 'https://evil.example', text: 'Evil' },
          { href: 'mailto:a@b.com', text: 'Email us' },
        ],
        forms: [],
        buttons: [],
      },
      '/about': { title: 'About', links: [{ href: '/', text: 'Home' }], forms: [], buttons: [] },
    });

    const siteMap = await crawl(page, { baseUrl });
    const routes = siteMap.map((p) => p.route).sort();
    expect(routes).toEqual(['/', '/about']);
  });

  it('respects maxPages', async () => {
    const { page } = makeFakePage({
      '/': { title: 'Home', links: [{ href: '/a', text: 'A' }, { href: '/b', text: 'B' }], forms: [], buttons: [] },
      '/a': { title: 'A', links: [], forms: [], buttons: [] },
      '/b': { title: 'B', links: [], forms: [], buttons: [] },
    });

    const siteMap = await crawl(page, { baseUrl, maxPages: 2 });
    expect(siteMap.length).toBe(2);
  });

  it('records the post-redirect route, not the requested one, for a client-side redirect', async () => {
    // Simulates an SPA auth guard: goto("/") lands the browser on
    // "/dashboard" via a client-side redirect (page.url() reflects that),
    // even though "/" is what was requested.
    const { page } = makeFakePage({
      '/dashboard': { title: 'Dashboard', links: [], forms: [], buttons: [] },
    });
    const originalGoto = page.goto.bind(page);
    page.goto = async (url) => {
      if (new URL(url).pathname === '/') {
        await originalGoto(new URL('/dashboard', url).toString());
      } else {
        await originalGoto(url);
      }
    };

    const siteMap = await crawl(page, { baseUrl });
    expect(siteMap.map((p) => p.route)).toEqual(['/dashboard']);
  });

  it('respects maxDepth', async () => {
    const { page } = makeFakePage({
      '/': { title: 'Home', links: [{ href: '/a', text: 'A' }], forms: [], buttons: [] },
      '/a': { title: 'A', links: [{ href: '/b', text: 'B' }], forms: [], buttons: [] },
      '/b': { title: 'B', links: [], forms: [], buttons: [] },
    });

    const siteMap = await crawl(page, { baseUrl, maxDepth: 1 });
    const routes = siteMap.map((p) => p.route).sort();
    expect(routes).toEqual(['/', '/a']);
  });

  it('does not interact with anything by default (interactive off)', async () => {
    const { page, locatorCalls } = makeFakePage({
      '/': {
        title: 'Home',
        links: [],
        forms: [{ index: 0, inputs: [{ index: 0, name: 'Email', type: 'email' }], submitText: 'Search' }],
        buttons: [{ index: 0, text: 'Show more' }],
      },
    });

    const siteMap = await crawl(page, { baseUrl });
    expect(locatorCalls).toEqual([]);
    expect(siteMap[0].interactions).toBeUndefined();
  });

  it('interactive mode acts only on safe form fields/buttons, never sensitive/destructive ones', async () => {
    const { page, locatorCalls } = makeFakePage({
      '/': {
        title: 'Home',
        links: [],
        forms: [
          { index: 0, inputs: [{ index: 0, name: 'Email', type: 'email' }], submitText: 'Search' },
          { index: 1, inputs: [{ index: 0, name: 'Password', type: 'password' }], submitText: 'Login' },
        ],
        buttons: [
          { index: 0, text: 'Show more' },
          { index: 1, text: 'Delete account' },
        ],
      },
    });

    const siteMap = await crawl(page, { baseUrl, interactive: true });

    expect(locatorCalls).toContain('[data-autodocs-crawl-id="input-0-0"]');
    expect(locatorCalls).toContain('[data-autodocs-crawl-id="submit-0"]');
    expect(locatorCalls).toContain('[data-autodocs-crawl-id="button-0"]');

    expect(locatorCalls).not.toContain('[data-autodocs-crawl-id="input-1-0"]');
    expect(locatorCalls).not.toContain('[data-autodocs-crawl-id="submit-1"]');
    expect(locatorCalls).not.toContain('[data-autodocs-crawl-id="button-1"]');

    expect(siteMap[0].interactions).toEqual([
      { type: 'submitForm', formIndex: 0, submitText: 'Search' },
      { type: 'click', buttonIndex: 0, text: 'Show more' },
    ]);
  });

  it('skips remaining interactions once one of them navigates the page away', async () => {
    const { page } = makeFakePage({
      '/': {
        title: 'Home',
        links: [],
        forms: [{ index: 0, inputs: [{ index: 0, name: 'Search', type: 'text' }], submitText: 'Search' }],
        buttons: [{ index: 0, text: 'Show more' }],
      },
    });
    // Simulate a real form submit navigating the page: the submit locator's
    // click() changes page.url(), same as a real Playwright navigation
    // would — the button's crawl-id tag from the pre-submit DOM is now gone.
    const originalLocator = page.locator;
    page.locator = (selector) => {
      const result = originalLocator(selector);
      if (selector === '[data-autodocs-crawl-id="submit-0"]') {
        return { ...result, click: async () => { await page.goto('http://localhost:3000/search?q=x'); } };
      }
      return result;
    };

    const siteMap = await crawl(page, { baseUrl, interactive: true });

    expect(siteMap[0].interactions).toEqual([
      { type: 'submitForm', formIndex: 0, submitText: 'Search' },
      { type: 'click', skipped: 'page navigated away from a prior interaction' },
    ]);
  });
});
