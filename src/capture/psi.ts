import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import type { PsiResult, PsiRun } from '../manifest.js';
import type { PageSpec } from '../pages.js';
import { desktopUserAgent } from './browser.js';
import { waitForReport, watchRateLimit } from './psi-report.js';

const REPORT_TIMEOUT_MS = 120_000;
const CONSENT_TIMEOUT_MS = 5_000;
const GAUGE_ANIMATION_MS = 1_500;
const MOBILE_PANEL_SELECTOR = '[aria-labelledby="mobile_tab"]';
const PSI_VIEWPORT_WIDTH = 1280;
const PSI_VIEWPORT_HEIGHT = 800;

async function dismissConsent(page: Page): Promise<void> {
  const consentButton = page.getByRole('button', { name: 'Ok, Got it.' });
  try {
    await consentButton.waitFor({ state: 'visible', timeout: CONSENT_TIMEOUT_MS });
    await consentButton.click();
  } catch {
    // No consent dialog was shown; nothing to dismiss.
  }
}

async function ensureMobileTabSelected(page: Page): Promise<void> {
  const mobileTab = page.getByRole('tab', { name: /mobile/i });
  const isSelected = await mobileTab.getAttribute('aria-selected');
  if (isSelected !== 'true') {
    await mobileTab.click();
  }
}

async function readMobileScore(page: Page): Promise<number> {
  const percentage = page.locator(`${MOBILE_PANEL_SELECTOR} .lh-gauge__percentage`).first();
  const text = (await percentage.innerText()).trim();
  const score = Number.parseInt(text, 10);
  if (Number.isNaN(score) || score < 0 || score > 100) {
    throw new Error(`PSI mobile performance score is not a number 0..100: "${text}"`);
  }
  return score;
}

const PERFORMANCE_SELECTOR = `${MOBILE_PANEL_SELECTOR} #performance`;
const GROUP_TITLE_SELECTOR = `${PERFORMANCE_SELECTOR} .lh-audit-group__title`;

/**
 * The first audit-group title inside the Performance section is always "Metrics" -
 * the clip must extend past the metric tiles down to the next group title
 * ("Opportunities" in older Lighthouse UIs, renamed "Insights" as of Lighthouse 13,
 * falling back to "Diagnostics" when a report has no insights group).
 */
async function findClipBottomTitle(page: Page) {
  const titles = page.locator(GROUP_TITLE_SELECTOR);
  const count = await titles.count();
  if (count === 0) {
    throw new Error('No .lh-audit-group__title found inside the PSI performance section');
  }
  return titles.nth(count === 1 ? 0 : 1);
}

/**
 * The deck paints a 7pt border on top of the screenshot's own edge, so anything
 * flush against the clip edge disappears underneath it. Measured 2026-09-21 on the
 * report of a blog page: the clip is 942x971 CSS px, contain-fit into whitedeck's
 * 1812x780pt `scope-shot` frame that is a scale of 0.40, so the 7pt border covers
 * 8.7 CSS px of image per side - and the "METRICS" / "INSIGHTS" group labels start
 * at exactly the same x as `#performance` (dx = 0.0) at 8.4 px per character. The
 * border ate one whole glyph: "METRICS" printed as "ETRICS". Pad the clip so the
 * border has whitespace to cover instead of text; 32 px keeps a visible margin even
 * for reports twice this tall, where the contain-fit scale roughly halves.
 */
const CLIP_PAD_PX = 32;
/**
 * The top edge needs far less: `#performance` starts right below the Lighthouse
 * category tab bar, so a 32px pad there drags a half-cut row of tab labels
 * ("Performance  Accessibility  Best Practices  SEO") into the shot. 10px is
 * still more than the 8.7px the border covers, without reaching the tabs.
 */
const CLIP_PAD_TOP_PX = 10;

async function captureClip(page: Page, filepath: string): Promise<void> {
  await page.waitForSelector(PERFORMANCE_SELECTOR, { state: 'visible', timeout: REPORT_TIMEOUT_MS });
  await page.waitForSelector(GROUP_TITLE_SELECTOR, { state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(GAUGE_ANIMATION_MS);

  const performanceBox = await page.locator(PERFORMANCE_SELECTOR).boundingBox();
  if (!performanceBox) {
    throw new Error('Could not read bounding box of the PSI performance gauge section');
  }

  const titleBox = await (await findClipBottomTitle(page)).boundingBox();
  if (!titleBox) {
    throw new Error('Could not read bounding box of the PSI clip-bottom audit group title');
  }

  const left = Math.max(0, performanceBox.x - CLIP_PAD_PX);
  const right = Math.min(PSI_VIEWPORT_WIDTH, performanceBox.x + performanceBox.width + CLIP_PAD_PX);
  const top = Math.max(0, performanceBox.y - CLIP_PAD_TOP_PX);
  const clip = {
    x: left,
    y: top,
    width: right - left,
    height: titleBox.y + titleBox.height + CLIP_PAD_PX - top
  };

  // Playwright clamps a clipped screenshot to the current viewport, and the clip
  // extends well below the 800px-tall desktop viewport - grow the viewport first
  // (width is unchanged, so the already-measured layout positions stay valid).
  const viewportHeight = Math.ceil(clip.y + clip.height) + 50;
  await page.setViewportSize({ width: PSI_VIEWPORT_WIDTH, height: viewportHeight });

  await page.screenshot({ path: filepath, clip });
}

async function captureOneRun(browser: Browser, page: PageSpec, runDir: string, suffix: string): Promise<PsiRun> {
  const context = await browser.newContext({
    viewport: { width: PSI_VIEWPORT_WIDTH, height: PSI_VIEWPORT_HEIGHT },
    deviceScaleFactor: 2,
    userAgent: await desktopUserAgent(browser)
  });
  const tab = await context.newPage();
  const rateLimit = watchRateLimit(tab);

  try {
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(page.url)}&form_factor=mobile`;
    /* pagespeed.web.dev is a heavy SPA: the `load` event waits on every
       subresource, and on a slow connection that regularly exceeds Playwright's
       default 30s goto timeout even though the site itself answers in seconds.
       Give the navigation the same generous budget as the report wait. */
    await tab.goto(psiUrl, { waitUntil: 'load', timeout: REPORT_TIMEOUT_MS });
    await waitForReport(tab, rateLimit, REPORT_TIMEOUT_MS);

    const analysisUrl = tab.url();
    if (!/\/analysis\//.test(analysisUrl)) {
      throw new Error(`PSI did not navigate to an /analysis/ URL, got: "${analysisUrl}"`);
    }

    await dismissConsent(tab);
    await ensureMobileTabSelected(tab);

    const shotsDir = join(runDir, 'shots');
    await mkdir(shotsDir, { recursive: true });
    const screenshotRelative = `shots/${page.slug}-psi${suffix}.png`;
    await captureClip(tab, join(runDir, screenshotRelative));

    const score = await readMobileScore(tab);
    return { screenshot: screenshotRelative, analysisUrl, score };
  } finally {
    await context.close();
  }
}

/* pagespeed.web.dev sometimes never shows the report (the `.lh-report` wait
   times out after 2 minutes) - one fresh attempt is normal, a second failure
   is the error. */
const RUN_ATTEMPTS = 2;
async function captureRunWithRetry(browser: Browser, page: PageSpec, runDir: string, suffix: string): Promise<PsiRun> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RUN_ATTEMPTS; attempt += 1) {
    try {
      return await captureOneRun(browser, page, runDir, suffix);
    } catch (error) {
      lastError = error;
      console.error(`psi: ${page.type} attempt ${attempt}/${RUN_ATTEMPTS} failed - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * PSI scores swing from run to run; `repeat` > 1 runs the test that often,
 * keeps every screenshot (`-psi-run1.png` ...) and selects the WORST run as
 * the slide's screenshot - the deck shows the bad case, the manifest keeps
 * the range for the review.
 */
export async function capturePsi(
  browser: Browser,
  page: PageSpec,
  runDir: string,
  repeat = 1
): Promise<PsiResult> {
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error(`PSI repeat must be a positive integer, got ${repeat}`);
  if (repeat === 1) {
    const only = await captureRunWithRetry(browser, page, runDir, '');
    return { ...only, formFactor: 'mobile' };
  }
  const runs: PsiRun[] = [];
  for (let k = 1; k <= repeat; k += 1) {
    runs.push(await captureRunWithRetry(browser, page, runDir, `-run${k}`));
  }
  const worst = runs.reduce((low, run) => (run.score < low.score ? run : low), runs[0] as PsiRun);
  return { ...worst, formFactor: 'mobile', runs };
}
