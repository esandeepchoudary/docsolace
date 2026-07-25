// Generic retry helper for operations that can fail transiently — a slow
// first response from a cold dev server, a brief network blip. Deliberately
// NOT used for anything that mutates app state (click/fill/upload/check):
// retrying one of those could silently double a real action (e.g. submit a
// form twice). Only apply this to read-only/idempotent operations —
// navigation, waiting for a selector — see capture.mjs/lib/auth.mjs/
// lib/crawl.mjs for where it is and isn't used.
export async function withRetry(fn, { retries = 2, delayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}
