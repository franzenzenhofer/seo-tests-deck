import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startConsentSite, type ConsentSite } from '../test-utils/consent-site.js';
import { readPngSize } from '../test-utils/png.js';
import { launchChromium } from './browser.js';
import { captureJs } from './js.js';

const EXPECTED_WIDTH = 390 * 3;

describe('captureJs', () => {
  let browser: Browser;
  let runDir: string;
  let site: ConsentSite;

  beforeAll(async () => {
    browser = await launchChromium();
    site = await startConsentSite();
    runDir = await mkdtemp(join(tmpdir(), 'seo-tests-deck-js-'));
  });

  afterAll(async () => {
    await browser.close();
    await site.close();
    await rm(runDir, { recursive: true, force: true });
  });

  it('captures js-on and js-off shots with no consent banner expected', async () => {
    const page = {
      type: 'Start Page',
      url: 'https://loremipsum.franzai.com/',
      slug: 'no-consent'
    };

    const result = await captureJs(browser, page, runDir);

    expect(result.onAfterConsent).toBeUndefined();

    const onSize = await readPngSize(join(runDir, result.on));
    const offSize = await readPngSize(join(runDir, result.off));
    expect(onSize.width).toBe(EXPECTED_WIDTH);
    expect(offSize.width).toBe(EXPECTED_WIDTH);

    expect((await stat(join(runDir, result.on))).size).toBeGreaterThan(0);
    expect((await stat(join(runDir, result.off))).size).toBeGreaterThan(0);
  });

  it('captures a post-consent shot when a consent banner is expected', async () => {
    const page = {
      type: 'Start Page',
      url: site.url,
      slug: 'with-consent'
    };

    const result = await captureJs(browser, page, runDir);

    expect(result.onAfterConsent).toBeDefined();
    expect(result.consentButtonText).toBe('Accept all');

    const afterConsentPath = join(runDir, result.onAfterConsent as string);
    const afterSize = await readPngSize(afterConsentPath);
    expect(afterSize.width).toBe(EXPECTED_WIDTH);
  });
});
