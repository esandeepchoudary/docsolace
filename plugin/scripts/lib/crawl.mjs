// Bounded, same-origin crawler used by /document map's dynamic-discovery
// half (see crawl.mjs for the CLI entry). Takes an already-launched
// Playwright `page` so it's unit-testable against a fake page object rather
// than a real browser.
//
// Read-only by default: navigates and records what's on each page, never
// submits a form or clicks an action button. An explicit, double-opt-in
// "interactive" mode (see crawl.mjs's --interactive + config's
// crawl.allowInteractive, mirroring seed.mjs's allowSeedCommands gate) adds
// safe form-fill/submit and non-destructive-click exploration — but even
// then, every interaction is filtered through isSensitiveField/
// isDestructiveControl first (see synthetic-data.mjs) as a hard exclusion,
// not a scope knob a config flag can widen.
import { isDestructiveControl, isSensitiveField, syntheticValueFor } from './synthetic-data.mjs';
import { withRetry } from './retry.mjs';

const LOGOUT_RE = /\blog ?out\b|\bsign ?out\b/i;
const CRAWL_ID_ATTR = 'data-docsolace-crawl-id';

// A candidate link is only followed if it resolves to an http(s) URL on
// exactly the same origin as the app's baseUrl — rejects absolute-external
// links, protocol-relative links ("//evil.example"), and non-navigational
// schemes (mailto:, tel:, javascript:). Same reasoning as tours.mjs's
// site-relative "goto" guard, applied to links discovered at runtime instead
// of authored in a tour.
export function isSameOrigin(href, baseOrigin) {
  if (typeof href !== 'string' || !href) return false;
  let parsed;
  try {
    parsed = new URL(href, baseOrigin);
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === baseOrigin;
}

// A logout/sign-out link would kill the crawl's own auth session mid-run —
// checked against both the href and the visible link text, since apps vary
// in which one actually says "logout".
export function isLogoutLink(href, text) {
  return LOGOUT_RE.test(href ?? '') || LOGOUT_RE.test(text ?? '');
}

// A crawl startPath is script/CLI-supplied — config's crawl.startPaths, or a
// --routes-file /document map's "confirmation crawl" writes from its own
// source reading (see crawl.mjs) — same untrusted-input trust boundary as a
// tour's "goto" step path (tours.mjs's loadTour applies the identical
// single-leading-slash guard there), so it gets the same check before being
// joined with baseUrl and navigated. Rejects an absolute or protocol-
// relative path that could otherwise steer the (possibly authenticated)
// crawl browser off-origin.
export function assertSiteRelativePath(candidate, label) {
  if (typeof candidate !== 'string' || !/^\/(?!\/)/.test(candidate)) {
    throw new Error(
      `${label} "${candidate}" is invalid — must be a site-relative path starting with a single "/", ` +
        `since it's joined with baseUrl and navigated to.`,
    );
  }
}

// Merges the per-pass site maps produced by running crawl() once per auth
// profile (plus one anonymous pass) — see crawl.mjs's --all-auth. Unions
// pages by route (a route reached under two different roles is one entry,
// not two), unions each page's reachedBy roles and affordances, and keeps
// the smallest depth seen (the shortest path any pass found to that route).
// Pure and unit-testable without a browser, same as planSafeInteractions.
export function mergeSiteMaps(siteMaps) {
  const byRoute = new Map();
  const formKey = (f) => `${f.inputCount}::${f.submitText}`;

  for (const siteMap of siteMaps ?? []) {
    for (const page of siteMap ?? []) {
      const existing = byRoute.get(page.route);
      if (!existing) {
        byRoute.set(page.route, {
          route: page.route,
          title: page.title,
          depth: page.depth,
          affordances: {
            forms: [...(page.affordances?.forms ?? [])],
            buttons: [...new Set(page.affordances?.buttons ?? [])],
            links: [...new Set(page.affordances?.links ?? [])],
          },
          reachedBy: [...new Set(page.reachedBy ?? [])],
          ...(page.interactions ? { interactions: page.interactions } : {}),
        });
        continue;
      }

      existing.depth = Math.min(existing.depth, page.depth);
      existing.reachedBy = [...new Set([...existing.reachedBy, ...(page.reachedBy ?? [])])];
      existing.affordances.buttons = [
        ...new Set([...existing.affordances.buttons, ...(page.affordances?.buttons ?? [])]),
      ];
      existing.affordances.links = [
        ...new Set([...existing.affordances.links, ...(page.affordances?.links ?? [])]),
      ];
      const existingFormKeys = new Set(existing.affordances.forms.map(formKey));
      for (const form of page.affordances?.forms ?? []) {
        if (!existingFormKeys.has(formKey(form))) {
          existing.affordances.forms.push(form);
          existingFormKeys.add(formKey(form));
        }
      }
      if (!existing.interactions && page.interactions) {
        existing.interactions = page.interactions;
      }
    }
  }

  return [...byRoute.values()];
}

// Runs in the page context: inventories links, forms (with per-field name/
// type), and standalone buttons, tagging each candidate element with a
// data-docsolace-crawl-id attribute so a later interactive pass can address
// the exact element without re-deriving brittle CSS selectors.
/* istanbul ignore next -- exercised only inside a real browser (page.evaluate), covered by live verification, not unit tests */
function collectPageData() {
  const ATTR = 'data-docsolace-crawl-id';
  const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || '').trim(),
  }));

  const forms = Array.from(document.querySelectorAll('form')).map((form, formIndex) => {
    form.setAttribute(ATTR, `form-${formIndex}`);
    const fieldEls = Array.from(form.querySelectorAll('input, textarea, select'));
    const inputs = fieldEls.map((el, inputIndex) => {
      el.setAttribute(ATTR, `input-${formIndex}-${inputIndex}`);
      return {
        index: inputIndex,
        name: el.getAttribute('aria-label') || el.getAttribute('name') || el.getAttribute('id') || '',
        type: (el.getAttribute('type') || el.tagName).toLowerCase(),
      };
    });
    const submitEl = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (submitEl) submitEl.setAttribute(ATTR, `submit-${formIndex}`);
    return {
      index: formIndex,
      inputs,
      submitText: (submitEl?.textContent || submitEl?.value || 'Submit').trim(),
    };
  });

  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter((b) => !b.closest('form'))
    .map((b, index) => {
      b.setAttribute(ATTR, `button-${index}`);
      return { index, text: (b.textContent || b.getAttribute('aria-label') || '').trim() };
    });

  return { title: document.title, links, forms, buttons };
}

async function extractPageData(page) {
  return page.evaluate(collectPageData);
}

// Pure decision function — given one page's extracted forms/buttons, decides
// which are safe to interact with. No sensitive field anywhere in a form
// excludes that whole form; a destructive-sounding submit/button excludes
// just that control. Unit-testable without a browser.
export function planSafeInteractions(pageData) {
  const actions = [];
  for (const form of pageData.forms ?? []) {
    if (form.inputs.some((input) => isSensitiveField(input.name, input.type))) continue;
    if (isDestructiveControl(form.submitText)) continue;
    const fields = form.inputs
      .filter((input) => !['submit', 'button', 'reset', 'hidden'].includes(input.type))
      .map((input) => ({ index: input.index, type: input.type, value: syntheticValueFor(input.name) }));
    actions.push({ type: 'submitForm', formIndex: form.index, fields, submitText: form.submitText });
  }
  for (const button of pageData.buttons ?? []) {
    if (isDestructiveControl(button.text)) continue;
    actions.push({ type: 'click', buttonIndex: button.index, text: button.text });
  }
  return actions;
}

// Executes an already-filtered interaction plan against the real page, using
// the data-docsolace-crawl-id tags collectPageData stamped. Best-effort: one
// action failing (e.g. a field that vanished between extract and act) is
// recorded, not thrown, so it can't abort the whole crawl.
async function executeSafeInteractions(page, actions, { navTimeoutMs }) {
  const performed = [];
  const startUrl = page.url();
  for (const action of actions) {
    // A prior action in this plan may have navigated the page (a form
    // submit is the common case) — every data-docsolace-crawl-id tag was
    // stamped on the pre-navigation DOM, so it no longer exists on whatever
    // loaded next. Stop rather than let a later action time out hunting for
    // an element that's gone; the crawl's own BFS will visit wherever this
    // navigation landed on its own.
    if (page.url() !== startUrl) {
      performed.push({ type: action.type, skipped: 'page navigated away from a prior interaction' });
      continue;
    }
    try {
      if (action.type === 'submitForm') {
        for (const field of action.fields) {
          const el = page.locator(`[${CRAWL_ID_ATTR}="input-${action.formIndex}-${field.index}"]`);
          if (field.type === 'checkbox' || field.type === 'radio') {
            await el.check();
          } else if (field.type === 'select' || field.type === 'select-one' || field.type === 'select-multiple') {
            const optionValue = await el.locator('option').nth(1).getAttribute('value');
            if (optionValue) await el.selectOption(optionValue);
          } else {
            await el.fill(field.value);
          }
        }
        await page.locator(`[${CRAWL_ID_ATTR}="submit-${action.formIndex}"]`).click({ timeout: navTimeoutMs });
        await page.waitForLoadState('networkidle').catch(() => {});
        performed.push({ type: 'submitForm', formIndex: action.formIndex, submitText: action.submitText });
      } else if (action.type === 'click') {
        await page.locator(`[${CRAWL_ID_ATTR}="button-${action.buttonIndex}"]`).click({ timeout: navTimeoutMs });
        performed.push({ type: 'click', buttonIndex: action.buttonIndex, text: action.text });
      }
    } catch (err) {
      performed.push({ type: action.type, error: err.message });
    }
  }
  return performed;
}

// Bounded BFS crawl starting from baseUrl (+ any extra startPaths), staying
// same-origin, up to maxPages/maxDepth. Returns a site map: one entry per
// visited route with its title, depth, and the affordances found there
// (forms/buttons/link text) — the raw material /document map's code-review
// step reconciles against the app's source.
export async function crawl(page, options) {
  const {
    baseUrl,
    startPaths = ['/'],
    maxPages = 50,
    maxDepth = 4,
    navTimeoutMs = 15000,
    // A single transient failure (slow first response from a cold dev
    // server, a brief network blip) shouldn't cost this page entirely —
    // retried once, with a short backoff, before giving up on it. Both
    // configurable (like navTimeoutMs above) so tests can keep this fast.
    gotoRetries = 1,
    gotoRetryDelayMs = 500,
    interactive = false,
    // Tags every page this pass records with which auth profile (or
    // 'anonymous') reached it — see crawl.mjs's --all-auth, which runs one
    // pass per profile and merges them with mergeSiteMaps above. Optional:
    // a caller that doesn't pass it (e.g. the existing unit tests) gets the
    // same untagged pages as before this option existed.
    reachedBy,
  } = options;

  const baseOrigin = new URL(baseUrl).origin;
  const visited = new Set();
  const siteMap = [];
  const queue = startPaths.map((p) => {
    assertSiteRelativePath(p, 'crawl startPath');
    return { url: new URL(p, baseUrl).toString(), depth: 0 };
  });

  while (queue.length > 0 && siteMap.length < maxPages) {
    const { url, depth } = queue.shift();
    const requestedRoute = new URL(url).pathname + new URL(url).search;
    if (visited.has(requestedRoute)) continue;
    visited.add(requestedRoute);

    // One page failing to load (a timeout, a 500, a connection reset)
    // shouldn't abort the whole crawl pass and lose every page already
    // discovered — retried once first (withRetry), then recorded as an
    // error entry and skipped if it still fails, so the BFS keeps going.
    let route;
    let data;
    try {
      await withRetry(() => page.goto(url, { waitUntil: 'networkidle', timeout: navTimeoutMs }), {
        retries: gotoRetries,
        delayMs: gotoRetryDelayMs,
      });

      // A same-origin client-side redirect (an SPA's auth guard bouncing "/"
      // to "/dashboard", for example) means page.url() after navigation can
      // differ from what was requested — record the route actually rendered,
      // not the one asked for, or the site map would mislabel real content
      // under the wrong route. If that resolved route was already recorded
      // via a different queued URL, this is a duplicate arrival at the same
      // page — mark it visited but don't double-record it.
      const finalUrl = new URL(page.url());
      route = finalUrl.pathname + finalUrl.search;
      if (route !== requestedRoute) {
        if (visited.has(route)) continue;
        visited.add(route);
      }

      data = await extractPageData(page);
    } catch (err) {
      siteMap.push({ route: requestedRoute, depth, error: err.message });
      continue;
    }

    let interactions;
    if (interactive) {
      const plan = planSafeInteractions(data);
      if (plan.length > 0) interactions = await executeSafeInteractions(page, plan, { navTimeoutMs });
    }

    siteMap.push({
      route,
      title: data.title,
      depth,
      affordances: {
        forms: data.forms.map((f) => ({ inputCount: f.inputs.length, submitText: f.submitText })),
        buttons: data.buttons.map((b) => b.text).filter(Boolean),
        links: data.links.map((l) => l.text).filter(Boolean),
      },
      ...(reachedBy ? { reachedBy: [reachedBy] } : {}),
      ...(interactions ? { interactions } : {}),
    });

    if (depth >= maxDepth) continue;
    for (const link of data.links) {
      if (isLogoutLink(link.href, link.text)) continue;
      if (!isSameOrigin(link.href, baseOrigin)) continue;
      const resolved = new URL(link.href, url);
      const linkedRoute = resolved.pathname + resolved.search;
      if (visited.has(linkedRoute)) continue;
      if (siteMap.length + queue.length >= maxPages) continue;
      queue.push({ url: resolved.toString(), depth: depth + 1 });
    }
  }

  return siteMap;
}
