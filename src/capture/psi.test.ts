import { stat } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPngSize } from '../test-utils/png.js';
import { launchChromium } from './browser.js';
import { capturePsi } from './psi.js';

/* Real pagespeed.web.dev runs take minutes; CI sets SEO_TESTS_DECK_SKIP_PSI=1
   and runs a PSI-free smoke instead. */
describe.skipIf(process.env['SEO_TESTS_DECK_SKIP_PSI'] === '1')('capturePsi', () => {
  let browser: Browser;
  let runDir: string;

  beforeAll(async () => {
    browser = await launchChromium();
    runDir = await mkdtemp(join(tmpdir(), 'seo-tests-deck-psi-'));
  });

  afterAll(async () => {
    await browser.close();
    await rm(runDir, { recursive: true, force: true });
  });

  it('captures the PSI mobile gauge for a real site', async () => {
    const page = {
      type: 'Start Page',
      url: 'https://loremipsum.franzai.com/',
      slug: 'start-page'
    };

    const result = await capturePsi(browser, page, runDir);

    expect(result.screenshot).toBe('shots/start-page-psi.png');
    expect(result.formFactor).toBe('mobile');
    expect(result.analysisUrl).toMatch(/\/analysis\//);

    const filePath = join(runDir, result.screenshot);
    const stats = await stat(filePath);
    expect(stats.size).toBeGreaterThan(20 * 1024);

    const size = await readPngSize(filePath);
    expect(size.width).toBeGreaterThan(800);
    expect(size.height).toBeGreaterThan(800);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('with --repeat keeps every run and selects the worst score for the slide', async () => {
    const page = {
      type: 'Start Page',
      url: 'https://loremipsum.franzai.com/',
      slug: 'repeat-page'
    };

    const result = await capturePsi(browser, page, runDir, 2);

    const runs = result.runs as NonNullable<typeof result.runs>;
    expect(runs.map((run) => run.screenshot)).toEqual(['shots/repeat-page-psi-run1.png', 'shots/repeat-page-psi-run2.png']);
    for (const run of runs) {
      expect((await stat(join(runDir, run.screenshot))).size).toBeGreaterThan(20 * 1024);
    }
    const worst = Math.min(...runs.map((run) => run.score));
    expect(result.score).toBe(worst);
    expect(runs.map((run) => run.screenshot)).toContain(result.screenshot);
  }, 600_000);

  it('rejects a non-positive repeat count', async () => {
    const page = { type: 'Start Page', url: 'https://loremipsum.franzai.com/', slug: 'bad' };
    await expect(capturePsi(browser, page, runDir, 0)).rejects.toThrow(/positive integer/);
  });
});
