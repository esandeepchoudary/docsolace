import { describe, expect, it, vi } from 'vitest';
import { assertSiteRelativePath, crawl, isLogoutLink, isSameOrigin, mergeSiteMaps, planSafeInteractions } from '../crawl.mjs';

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

describe('assertSiteRelativePath', () => {
  it('accepts a site-relative path', () => {
    expect(() => assertSiteRelativePath('/admin/users', 'label')).not.toThrow();
  });

  it('rejects an absolute external URL', () => {
    expect(() => assertSiteRelativePath('https://evil.example', 'label')).toThrow(/site-relative/);
  });

  it('rejects a protocol-relative path', () => {
    expect(() => assertSiteRelativePath('//evil.example', 'label')).toThrow(/site-relative/);
  });

  it('rejects a non-string or empty value', () => {
    expect(() => assertSiteRelativePath(undefined, 'label')).toThrow(/site-relative/);
    expect(() => assertSiteRelativePath('', 'label')).toThrow(/site-relative/);
    expect(() => assertSiteRelativePath('no-leading-slash', 'label')).toThrow(/site-relative/);
  });

  it('includes the given label in the error so the source is traceable', () => {
    expect(() => assertSiteRelativePath('bad', 'crawl startPath')).toThrow(/crawl startPath/);
  });
});

describe('mergeSiteMaps', () => {
  it('unions pages by route, merging reachedBy and affordances', () => {
    const anonymous = [
      {
        route: '/login',
        title: 'Login',
        depth: 0,
        affordances: { forms: [{ inputCount: 2, submitText: 'Log in' }], buttons: [], links: ['Sign up'] },
        reachedBy: ['anonymous'],
      },
    ];
    const admin = [
      {
        route: '/dashboard',
        title: 'Dashboard',
        depth: 0,
        affordances: { forms: [], buttons: ['Delete user'], links: [] },
        reachedBy: ['admin'],
      },
    ];
    const standardUser = [
      {
        route: '/dashboard',
        title: 'Dashboard',
        depth: 1,
        affordances: { forms: [], buttons: ['Export CSV'], links: ['Settings'] },
        reachedBy: ['standard-user'],
      },
    ];

    const merged = mergeSiteMaps([anonymous, admin, standardUser]);
    const dashboard = merged.find((p) => p.route === '/dashboard');
    const login = merged.find((p) => p.route === '/login');

    expect(merged).toHaveLength(2);
    expect(login.reachedBy).toEqual(['anonymous']);
    // Roles from every pass that reached this route are unioned...
    expect(dashboard.reachedBy.sort()).toEqual(['admin', 'standard-user']);
    // ...as are the affordances a different role's view revealed...
    expect(dashboard.affordances.buttons.sort()).toEqual(['Delete user', 'Export CSV']);
    expect(dashboard.affordances.links).toEqual(['Settings']);
    // ...and the shallowest depth any pass found this route at wins.
    expect(dashboard.depth).toBe(0);
  });

  it('de-dupes an identical form seen by more than one pass, keeping distinct ones', () => {
    const passA = [
      {
        route: '/search',
        title: 'Search',
        depth: 0,
        affordances: { forms: [{ inputCount: 1, submitText: 'Search' }], buttons: [], links: [] },
        reachedBy: ['anonymous'],
      },
    ];
    const passB = [
      {
        route: '/search',
        title: 'Search',
        depth: 0,
        affordances: {
          forms: [
            { inputCount: 1, submitText: 'Search' },
            { inputCount: 3, submitText: 'Advanced search' },
          ],
          buttons: [],
          links: [],
        },
        reachedBy: ['standard-user'],
      },
    ];

    const merged = mergeSiteMaps([passA, passB]);
    expect(merged[0].affordances.forms).toEqual([
      { inputCount: 1, submitText: 'Search' },
      { inputCount: 3, submitText: 'Advanced search' },
    ]);
  });

  it('returns an empty array for no input', () => {
    expect(mergeSiteMaps([])).toEqual([]);
    expect(mergeSiteMaps(undefined)).toEqual([]);
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

  it('tags every recorded page with reachedBy when a pass id is given', async () => {
    const { page } = makeFakePage({
      '/': { title: 'Home', links: [{ href: '/about', text: 'About' }], forms: [], buttons: [] },
      '/about': { title: 'About', links: [], forms: [], buttons: [] },
    });

    const siteMap = await crawl(page, { baseUrl, reachedBy: 'standard-user' });
    expect(siteMap.every((p) => p.reachedBy)).toBe(true);
    expect(siteMap.map((p) => p.reachedBy)).toEqual([['standard-user'], ['standard-user']]);
  });

  it('omits reachedBy entirely when no pass id is given (back-compat)', async () => {
    const { page } = makeFakePage({
      '/': { title: 'Home', links: [], forms: [], buttons: [] },
    });

    const siteMap = await crawl(page, { baseUrl });
    expect(siteMap[0].reachedBy).toBeUndefined();
  });

  it('rejects an absolute or protocol-relative startPath instead of navigating to it', async () => {
    const { page } = makeFakePage({});
    await expect(crawl(page, { baseUrl, startPaths: ['https://evil.example'] })).rejects.toThrow(/site-relative/);
    await expect(crawl(page, { baseUrl, startPaths: ['//evil.example'] })).rejects.toThrow(/site-relative/);
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

    expect(locatorCalls).toContain('[data-docsolace-crawl-id="input-0-0"]');
    expect(locatorCalls).toContain('[data-docsolace-crawl-id="submit-0"]');
    expect(locatorCalls).toContain('[data-docsolace-crawl-id="button-0"]');

    expect(locatorCalls).not.toContain('[data-docsolace-crawl-id="input-1-0"]');
    expect(locatorCalls).not.toContain('[data-docsolace-crawl-id="submit-1"]');
    expect(locatorCalls).not.toContain('[data-docsolace-crawl-id="button-1"]');

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
      if (selector === '[data-docsolace-crawl-id="submit-0"]') {
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

  it('records an error entry for a page that fails to load, and keeps crawling the rest instead of aborting the whole pass', async () => {
    const { page } = makeFakePage({
      '/': {
        title: 'Home',
        links: [
          { href: '/a', text: 'A' },
          { href: '/b', text: 'B' },
        ],
        forms: [],
        buttons: [],
      },
      '/b': { title: 'B', links: [], forms: [], buttons: [] },
    });
    const originalGoto = page.goto.bind(page);
    page.goto = async (url) => {
      if (new URL(url).pathname === '/a') {
        throw new Error('net::ERR_CONNECTION_RESET');
      }
      await originalGoto(url);
    };

    const siteMap = await crawl(page, { baseUrl, gotoRetryDelayMs: 0 });

    const home = siteMap.find((p) => p.route === '/');
    const a = siteMap.find((p) => p.route === '/a');
    const b = siteMap.find((p) => p.route === '/b');
    expect(home).toBeDefined();
    expect(b).toBeDefined();
    expect(a).toBeDefined();
    expect(a.error).toMatch(/ERR_CONNECTION_RESET/);
    expect(a.title).toBeUndefined();
  });

  it('retries a transient goto failure before giving up on the page', async () => {
    const { page } = makeFakePage({
      '/': { title: 'Home', links: [], forms: [], buttons: [] },
    });
    let attempts = 0;
    const originalGoto = page.goto.bind(page);
    page.goto = async (url) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient failure');
      await originalGoto(url);
    };

    const siteMap = await crawl(page, { baseUrl, gotoRetries: 1, gotoRetryDelayMs: 1 });

    expect(attempts).toBe(2);
    expect(siteMap).toEqual([expect.objectContaining({ route: '/', title: 'Home' })]);
  });
});
