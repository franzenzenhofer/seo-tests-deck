import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderFixtureShot } from '../test-utils/fixture-shots.js';
import { readPngSize } from '../test-utils/png.js';
import { launchChromium } from './browser.js';
import { openGoogleSession } from './google-session.js';
import { resolveGoogleSession } from './google-source.js';
import { captureGsc } from './gsc.js';

/* Real Search Console, real live test, real signed-in Google session (resolved
   like the CLI does: --cdp / profile / CDP command). Runs only when
   SEO_TESTS_DECK_GSC_PROPERTY names a property that session can see;
   SEO_TESTS_DECK_GSC_URL is the URL to inspect (default: the property root). */
const property = process.env['SEO_TESTS_DECK_GSC_PROPERTY'];
const url = process.env['SEO_TESTS_DECK_GSC_URL'] ?? property ?? '';

describe.skipIf(property === undefined)('captureGsc (real Search Console live test)', () => {
  it('captures the live-test screenshot, the resources panel and Google render', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'seo-gsc-'));
    const browser = await launchChromium();
    await renderFixtureShot(browser, { file: join(runDir, 'shots', 'page-js-on.png'), width: 390, height: 844, label: 'browser' });
    await browser.close();
    const session = await openGoogleSession(resolveGoogleSession({}, process.env));
    try {
      const result = await captureGsc(session, { type: 'Start Page', url, slug: 'page' }, runDir, {
        property: property as string,
        browserShot: 'shots/page-js-on.png'
      });
      expect(result.inspectUrl).toMatch(/search-console\/inspect\?resource_id=.*&id=/);
      expect(result.verdict).toMatch(/^URL is /);
      expect(result.resourcesStatus).toMatch(/couldn't be loaded|loaded/i);
      expect(statSync(join(runDir, result.screenshot)).size).toBeGreaterThan(50_000);
      expect((await readPngSize(join(runDir, result.screenshot))).width).toBeGreaterThan(1000);
      /* 400 CSS px of panel at deviceScaleFactor 2, legible once contain-fitted on the slide. */
      expect((await readPngSize(join(runDir, result.resources))).width).toBe(800);
      const render = await readPngSize(join(runDir, result.render as string));
      expect(render.width).toBeGreaterThanOrEqual(300);
      expect(render.height).toBeGreaterThan(render.width);
      const compare = await readPngSize(join(runDir, result.renderCompare as string));
      expect(compare.height).toBeGreaterThan(1200);
    } finally {
      await session.close();
    }
  }, 600_000);
});
