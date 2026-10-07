import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Findings } from '../findings.js';
import type { Manifest } from '../manifest.js';
import { countPdfPages } from '../test-utils/pdf.js';
import { launchChromium } from '../capture/browser.js';
import { renderFixtureShot } from '../test-utils/fixture-shots.js';
import { defaultBrandLogo } from './asset-paths.js';
import { copyDeckAssets } from './copy-assets.js';
import { buildDeckMarkdown } from './deck-md.js';
import { readPngSize } from '../test-utils/png.js';
import { checkDeck } from './check.js';
import { runWhitedeckBuild, runWhitedeckValidate } from './run-whitedeck.js';

const SLIDES = 3 + (1 + 1) + (1 + 3);

const MANIFEST: Manifest = {
  site: { brand: 'example.com', origin: 'https://example.com/' },
  capturedAt: new Date().toISOString(),
  pages: [
    {
      type: 'Start Page',
      url: 'https://example.com/',
      slug: 'start-page',
      psi: {
        screenshot: 'shots/start-page-psi.png',
        analysisUrl: 'https://pagespeed.web.dev/analysis/start',
        score: 50,
        formFactor: 'mobile'
      }
    },
    {
      type: 'Detail Page',
      url: 'https://example.com/a',
      slug: 'detail-page',
      psi: {
        screenshot: 'shots/detail-page-psi.png',
        analysisUrl: 'https://pagespeed.web.dev/analysis/detail',
        score: 65,
        formFactor: 'mobile'
      },
      js: {
        on: 'shots/detail-page-js-on.png',
        onAfterConsent: 'shots/detail-page-js-on-after.png',
        off: 'shots/detail-page-js-off.png'
      },
      gsc: {
        screenshot: 'shots/detail-page-gsc.png',
        resources: 'shots/detail-page-gsc-resources.png',
        inspectUrl: 'https://search.google.com/search-console/inspect?resource_id=x',
        verdict: 'Page is not usable on mobile',
        resourcesStatus: '4/64 resources could not be loaded'
      }
    }
  ]
};

const FINDINGS: Findings = {
  brand: 'example.com',
  date: '27.05.2024',
  pages: {
    'start-page': { psi: { status: 'ok', is: [], should: [] } },
    'detail-page': {
      js: {
        status: 'not-ok',
        is: ['cookie banner initially displayed'],
        should: ['display cookie banner after minimal user interaction'],
        highlight: ['off']
      },
      gsc: {
        status: 'not-ok',
        is: ['4/64 resources could not be loaded'],
        should: ['allow Googlebot to load all render-critical resources']
      }
    }
  }
};

const FIXTURES: readonly (readonly [string, number, number])[] = [
  ['shots/start-page-psi.png', 942, 971],
  ['shots/detail-page-psi.png', 942, 971],
  ['shots/detail-page-js-on.png', 390, 664],
  ['shots/detail-page-js-on-after.png', 390, 664],
  ['shots/detail-page-js-off.png', 390, 664],
  ['shots/detail-page-gsc.png', 1100, 900],
  ['shots/detail-page-gsc-resources.png', 400, 500]
];

async function buildFixtureRun(runDir: string): Promise<void> {
  const browser = await launchChromium();
  try {
    for (const [path, width, height] of FIXTURES) {
      await renderFixtureShot(browser, { file: join(runDir, path), width, height, label: path });
    }
  } finally {
    await browser.close();
  }
}

describe('buildDeckMarkdown', () => {
  let runDir: string;
  let deckDir: string;
  let deckMarkdown: string;

  beforeAll(async () => {
    runDir = await mkdtemp(join(tmpdir(), 'seo-tests-deck-run-'));
    deckDir = await mkdtemp(join(tmpdir(), 'seo-tests-deck-out-'));
    await buildFixtureRun(runDir);
    deckMarkdown = buildDeckMarkdown(MANIFEST, FINDINGS, { author: 'Example Author' });
    await copyDeckAssets(runDir, deckDir, MANIFEST, defaultBrandLogo());
    await writeFile(join(deckDir, 'deck.md'), deckMarkdown, 'utf8');
  });

  afterAll(async () => {
    await rm(runDir, { recursive: true, force: true });
    await rm(deckDir, { recursive: true, force: true });
  });

  it('emits the exact slide count: 3 + pages x (1 + tests present)', () => {
    const slideCount = deckMarkdown.split('\n\n---\n\n').length;
    expect(slideCount).toBe(SLIDES);
  });

  it('puts the at-a-glance summary right after the overview', () => {
    const slides = deckMarkdown.split('\n\n---\n\n');
    expect(slides[2]).toContain('# 1 of 2 page types pass all 3 SEO tests');
    expect(slides[2]).toContain('- **PSI mobile:** 1 of 2 ok, scores 50 to 65 (pass: 80+)');
    expect(slides[2]).toContain('- **JS turned off:** 0 of 1 ok');
    expect(slides[2]).toContain('- **GSC live test:** 0 of 1 ok');
    expect(deckMarkdown).toContain('Footer: Example Author / 27.05.2024');
  });

  it('emits the verbatim overview bullets', () => {
    expect(deckMarkdown).toContain(
      '- **Page Speed Insights: minimum score of 80 (still orange) / preferably 90 ([green]{#1db100}) + sensemaking screenshots** for mobile!'
    );
    expect(deckMarkdown).toContain('- **"JS turned off"** Test:');
    expect(deckMarkdown).toContain(
      '- Google Search Console -> **Inspect URL -> Test Live URL -> View Tested Page -> Screenshot must show rendered page!** (Images below fold (non-visible) might get lazy loaded)'
    );
  });

  it('labels both JS-on shots and borders only the highlighted JS-off shot', () => {
    const labelOnCount = (deckMarkdown.match(/label="JS on"/g) ?? []).length;
    expect(labelOnCount).toBe(2);
    expect(deckMarkdown).toContain('![label="JS off" border=red](shots/detail-page-js-off.png)');
    expect(deckMarkdown).not.toContain('![label="JS on" border=red]');
  });

  it('defaults the start-page PSI border to green via the findings override', () => {
    expect(deckMarkdown).toContain('![border=green](shots/start-page-psi.png)');
  });

  it('defaults the detail-page PSI border to red from the score when no finding is given', () => {
    expect(deckMarkdown).toContain('![border=red](shots/detail-page-psi.png)');
  });

  it('renders the GSC IS/SHOULD block and a red border on the main screenshot', () => {
    expect(deckMarkdown).toContain('![border=red](shots/detail-page-gsc.png)');
    expect(deckMarkdown).toContain('![border=green](shots/detail-page-gsc-resources.png)');
    expect(deckMarkdown).toContain('- **IS (not ok)**');
    expect(deckMarkdown).toContain('- 4/64 resources could not be loaded');
    expect(deckMarkdown).toContain('- **SHOULD**');
  });

  it('validates as ok through the real whitedeck binary', async () => {
    const report = (await runWhitedeckValidate(join(deckDir, 'deck.md'))) as { ok: boolean };
    expect(report.ok).toBe(true);
  });

  it('builds a real PDF with the expected page count', async () => {
    await runWhitedeckBuild(deckDir, 'pdf');
    const pageCount = await countPdfPages(join(deckDir, 'deck.pdf'));
    expect(pageCount).toBe(SLIDES);
  });

  it('renders every slide to a PNG for the mandatory slide review', async () => {
    await runWhitedeckBuild(deckDir, 'html');
    const result = await checkDeck(deckDir);
    expect(result.slides).toHaveLength(SLIDES);
    const first = await readPngSize(result.slides[0] as string);
    expect(first).toEqual({ width: 1920, height: 1080 });
    const sheet = await readPngSize(result.sheet);
    expect(sheet.width).toBeGreaterThan(1000);
    expect(result.overflows).toEqual([]);
  }, 120_000);
});
