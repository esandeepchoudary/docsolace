// Combines a config-wide default mask list with a capture step's own,
// deduped and order-preserving (defaults first).
export function mergeMasks(defaultMask, stepMask) {
  const merged = [...(defaultMask ?? []), ...(stepMask ?? [])];
  return [...new Set(merged)];
}

// Screenshot masks only paint over pixels. The accessibility snapshot is read
// from the DOM, so a masked value (an email, a token) would still sit in the
// text the writing agent reads. `collectMaskedStrings` (in capture.mjs) pulls
// every visible string out of the masked elements; this removes them from the
// snapshot text. Longest first so a short string can't split a longer one.
export const REDACTED = '[redacted]';

export function redactSnapshotText(text, secrets) {
  const unique = [...new Set((secrets ?? []).map((s) => String(s).trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const secret of unique) {
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Very short strings (a masked "5") only match as a whole word, so
    // redacting them doesn't shred unrelated text.
    const pattern = secret.length < 4 ? new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'g') : new RegExp(escaped, 'g');
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

// Every visible string inside the masked elements: their text, form values,
// and the attributes that become accessible names. A selector that matches
// nothing (or is invalid at this viewport) just contributes nothing.
export async function collectMaskedStrings(page, selectors) {
  const strings = [];
  for (const selector of selectors) {
    try {
      const found = await page.locator(selector).evaluateAll((els) => {
        const out = [];
        for (const el of els) {
          const text = (el.innerText ?? el.textContent ?? '').trim();
          if (text) {
            out.push(text, ...text.split('\n'));
          }
          if ('value' in el && typeof el.value === 'string') out.push(el.value);
          for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
            const v = el.getAttribute(attr);
            if (v) out.push(v);
          }
        }
        return out;
      });
      strings.push(...found);
    } catch {
      // unmatched or invalid-here selector: nothing to collect
    }
  }
  return strings;
}

