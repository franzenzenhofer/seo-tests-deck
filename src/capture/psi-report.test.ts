import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchChromium } from './browser.js';
import { waitForReport, watchRateLimit } from './psi-report.js';

/* The two ends of the PSI wait, in a real browser: a page with the report
   resolves, a page with PSI's error panel fails fast with the text shown. */
describe('waitForReport', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('resolves once the Lighthouse report is visible', async () => {
    const page = await browser.newPage();
    await page.setContent('<div class="lh-report">report</div>');
    await expect(waitForReport(page, watchRateLimit(page), 5_000)).resolves.toBeUndefined();
  });

  it('fails fast with the error PSI shows instead of waiting for the timeout', async () => {
    const page = await browser.newPage();
    await page.setContent('<p>Unable to resolve https://www.example.com/. Try checking the URL for validity.</p>');
    const started = Date.now();
    await expect(waitForReport(page, watchRateLimit(page), 60_000)).rejects.toThrow(/shows "Unable to resolve https:\/\/www\.example\.com\/\./);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
