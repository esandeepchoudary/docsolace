// Real-browser proof that a masked value never reaches the accessibility
// snapshot the writing agent reads. Skipped when Chromium isn't installed.
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { collectMaskedStrings, redactSnapshotText } from '../masking.mjs';

let browser = null;
try {
  browser = await chromium.launch();
} catch {
  // no browser here
}

describe.skipIf(!browser)('accessibility snapshot redaction (real browser)', () => {
  it('removes the canary from text, input values and accessible names, and leaves the rest', async () => {
    const page = await browser.newPage();
    await page.setContent(
      `<h1>Billing</h1><p id="e">Account: DOCSOLACE_SECRET_CANARY_123</p>` +
        `<input id="t" aria-label="Token DOCSOLACE_SECRET_CANARY_123" value="DOCSOLACE_SECRET_CANARY_123"><button>Save</button>`,
    );
    const raw = await page.locator('body').ariaSnapshot();
    expect(raw).toContain('CANARY');
    const strings = await collectMaskedStrings(page, ['#e', '#t', 'role=button[name="Nothing"]']);
    const redacted = redactSnapshotText(raw, strings);
    expect(redacted).not.toContain('CANARY');
    expect(redacted).toContain('Billing');
    expect(redacted).toContain('Save');
    await page.close();
  });
});

import { afterAll } from 'vitest';
afterAll(async () => {
  await browser?.close();
});
