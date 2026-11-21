// Optional per-step assertions about where a tour actually is. A same-origin
// session expiry redirects /billing to /login and still "succeeds" at taking a
// screenshot — `expectUrl` makes that a hard failure instead of a published
// picture of the wrong page.
// `baseUrl` may carry a path prefix (http://host/app); goto appends its path to
// it, so expectUrl is resolved the same way.
export function matchesExpectedPath(actualUrl, expected, baseUrl) {
  let url;
  try {
    url = new URL(actualUrl);
  } catch {
    return false;
  }
  let origin;
  let prefix = '';
  if (baseUrl) {
    try {
      const base = new URL(baseUrl);
      origin = base.origin;
      prefix = base.pathname.replace(/\/+$/, '');
    } catch {
      origin = baseUrl; // already a bare origin
    }
    if (url.origin !== origin) return false;
  }
  expected = `${prefix}${expected}`;
  if (expected.endsWith('*')) return url.pathname.startsWith(expected.slice(0, -1));
  // Query/hash are ignored; a trailing slash is not significant.
  const trim = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  return trim(url.pathname) === trim(expected);
}

export function validateExpectations(step, { tourId, index, isGoto, isClick, isCapture }) {
  const where = `Tour "${tourId}" step ${index}`;
  if (step.expectUrl !== undefined) {
    if (!(isGoto || isClick || isCapture)) {
      throw new Error(`${where}: "expectUrl" is only valid on a goto, click or capture step.`);
    }
    if (typeof step.expectUrl !== 'string' || !/^\/(?!\/)/.test(step.expectUrl)) {
      throw new Error(`${where}: "expectUrl" must be a site-relative path starting with "/" (a trailing "*" matches a prefix).`);
    }
    if (/[?#]/.test(step.expectUrl)) {
      throw new Error(`${where}: "expectUrl" matches the path only — drop the query/hash (use "expectVisible" to tell hash-routed pages apart).`);
    }
  }
  if (step.expectVisible !== undefined) {
    if (!(isGoto || isClick || isCapture)) {
      throw new Error(`${where}: "expectVisible" is only valid on a goto, click or capture step.`);
    }
    if (typeof step.expectVisible !== 'string' || !step.expectVisible.trim()) {
      throw new Error(`${where}: "expectVisible" must be a non-empty locator string.`);
    }
  }
  if (step.waitFor !== undefined) {
    if (!(isGoto || isClick || step.action === 'upload')) {
      throw new Error(`${where}: "waitFor" is only valid on a goto, click or upload step.`);
    }
    if (typeof step.waitFor !== 'string' || !step.waitFor.trim()) {
      throw new Error(`${where}: "waitFor" must be a non-empty locator string.`);
    }
  }
}
