// Shared safety/synthesis rules for anything that fills a field or clicks a
// control on a real app without a human directly driving it — the crawler's
// interactive mode (crawl.mjs) and tour-scout's form-filling guidance both
// need the exact same answer to "is this field sensitive" and "is this
// control destructive", so the rules live here once instead of drifting
// between a script and a subagent's prose.

// Field types/names that must never be auto-filled, synthetic or not — a
// captured screenshot showing something that *looks* like a real SSN/card
// number is the same failure mode as a real credential leaking into a
// screenshot, even though the value itself is fake.
const SENSITIVE_TYPES = new Set(['password']);
const SENSITIVE_NAME_RE =
  /\b(ssn|social security|passport|driver'?s?\s*licen[cs]e|national id|government id)\b|credit card|card number|\bcvv\b|\bcvc\b|security code|bank account|routing number|\biban\b|\bpassword\b|\bsecret\b|api[\s-]?key|\btoken\b/i;

export function isSensitiveField(accessibleNameOrLabel, fieldType) {
  if (typeof fieldType === 'string' && SENSITIVE_TYPES.has(fieldType.toLowerCase())) return true;
  if (typeof accessibleNameOrLabel !== 'string') return false;
  return SENSITIVE_NAME_RE.test(accessibleNameOrLabel);
}

// Controls whose accessible name signals a real-world side effect (deleting
// data, sending something, moving money, ending the session) — never
// clicked automatically, regardless of how "safe" everything else on the
// page looks. \b word boundaries keep this from matching inside an
// unrelated word (e.g. "Sender" doesn't match "send").
const DESTRUCTIVE_RE =
  /\b(delete|remove|deactivate|deauthorize|revoke|cancel subscription|pay|purchase|buy now|checkout|send|transfer|withdraw|unsubscribe|log ?out|sign ?out)\b/i;

export function isDestructiveControl(accessibleName) {
  if (typeof accessibleName !== 'string') return false;
  return DESTRUCTIVE_RE.test(accessibleName);
}

// Synthesizes an obviously-fake placeholder for a field, inferred from its
// accessible name — same conventions as tour-scout.md's "Forms" guidance
// (reserved-for-fiction domains/numbers, never a real-looking value).
const EMAIL_RE = /e-?mail/i;
const PHONE_RE = /phone|mobile|\btel(ephone)?\b/i;
const ADDRESS_RE = /\baddress\b|street|\bcity\b|\bstate\b|\bzip\b|postal/i;
const DATE_RE = /\bdate\b|\bdob\b|birth/i;
const NAME_RE = /\bname\b/i;

export function syntheticValueFor(accessibleName) {
  const name = typeof accessibleName === 'string' ? accessibleName : '';
  if (EMAIL_RE.test(name)) return 'user@example.com';
  if (PHONE_RE.test(name)) return '555-0100';
  if (ADDRESS_RE.test(name)) return '123 Example Street';
  if (DATE_RE.test(name)) return '2020-01-01';
  if (NAME_RE.test(name)) return 'Test User';
  return 'Example value';
}
