import type { Locator, Page } from 'playwright';

/* Search Console web UI steps: property page -> "Inspect any URL" box -> TEST
   LIVE URL -> verdict -> VIEW TESTED PAGE. The URL Inspection API returns no
   screenshot and has no live test, so the capture drives the UI. */

export const SETTLE_MS = 3_000;
export const INSPECT_TIMEOUT_MS = 120_000;
const LIVE_TEST_TIMEOUT_MS = 240_000;
const LIVE_TEST_POLL_MS = 5_000;
const LIVE_TEST_ATTEMPTS = 2;

export const consoleHomeUrl = (): string => 'https://search.google.com/search-console?hl=en';

export const consoleUrl = (property: string): string =>
  `https://search.google.com/search-console?resource_id=${encodeURIComponent(property)}&hl=en`;

export const bodyText = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* Signed out, Search Console redirects to its marketing page (/about) or to
   accounts.google.com; a signed-in page always has the URL inspection nav. */
export const assertLoggedIn = async (page: Page): Promise<void> => {
  const url = page.url();
  const text = await bodyText(page);
  const signedOut = /accounts\.google\.com|\/search-console\/about/.test(url) || /Signed out|Choose an account/i.test(text);
  if (signedOut || !/URL inspection/i.test(text)) {
    throw new Error(`Google session is not signed in to Search Console (landed on ${url}). Run "seo-tests-deck login", or pass --cdp / --profile, then retry`);
  }
};

export const button = (page: Page, text: RegExp): Locator =>
  page.locator('div[role="button"], button').filter({ hasText: text }).first();

export const inspect = async (page: Page, url: string): Promise<void> => {
  const input = page.locator('input[aria-label^="Inspect any URL"]').first();
  await input.waitFor({ timeout: INSPECT_TIMEOUT_MS });
  await input.fill(url);
  await input.press('Enter');
  await button(page, /^Test live URL$/i).waitFor({ timeout: INSPECT_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
};

type LiveOutcome = 'ok' | 'error' | 'timeout';

const waitForLiveTest = async (page: Page): Promise<LiveOutcome> => {
  const start = Date.now();
  while (Date.now() - start < LIVE_TEST_TIMEOUT_MS) {
    await page.waitForTimeout(LIVE_TEST_POLL_MS);
    const text = await bodyText(page);
    if (/View tested page/i.test(text)) return 'ok';
    if (/Something went wrong/i.test(text)) return 'error';
  }
  return 'timeout';
};

/* GSC sometimes answers "Something went wrong" after a minute; one retry is
   normal, a second failure is reported as an error. */
export const runLiveTest = async (page: Page, url: string): Promise<void> => {
  for (let attempt = 1; attempt <= LIVE_TEST_ATTEMPTS; attempt += 1) {
    await button(page, /^Test live URL$/i).click();
    const outcome = await waitForLiveTest(page);
    if (outcome === 'ok') return;
    const dismiss = button(page, /^Dismiss$/);
    if ((await dismiss.count()) > 0) await dismiss.click();
    await page.waitForTimeout(SETTLE_MS);
    if (attempt === LIVE_TEST_ATTEMPTS) {
      throw new Error(`GSC live test failed twice for ${url} (${outcome})`);
    }
  }
};

export const readVerdict = async (page: Page): Promise<string> => {
  const text = await bodyText(page);
  const match = /URL is (?:available to Google|not available to Google|on Google)[^.]*/i.exec(text);
  if (match === null) throw new Error('GSC live test verdict not found on the page');
  return match[0].trim();
};

export const readResourcesStatus = async (page: Page): Promise<string> => {
  const texts = await page.locator('div[role="button"]').filter({ hasText: /Page resources/i }).allInnerTexts();
  const last = texts.at(-1);
  if (last === undefined) throw new Error('GSC "Page resources" entry not found');
  return last.replace(/Page resources/i, '').replace(/\s+/g, ' ').trim();
};

export const openTestedPage = async (page: Page, tab: RegExp): Promise<void> => {
  await button(page, /^View tested page$/i).click();
  await page.waitForTimeout(SETTLE_MS);
  await page.locator('div[role="tab"]').filter({ hasText: tab }).last().click();
  await page.waitForTimeout(SETTLE_MS);
};
