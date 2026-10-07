import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Locator, Page } from 'playwright';
import type { JsResult } from '../manifest.js';
import type { PageSpec } from '../pages.js';
import { iPhone13Context } from './browser.js';

const NAVIGATION_TIMEOUT_MS = 60_000;
const FIXED_LOAD_WAIT_MS = 3_000;
const CONSENT_CLICK_WAIT_MS = 2_000;

const CONSENT_TEXTS = [
  'Akzeptieren',
  'Alle akzeptieren',
  'Alles akzeptieren',
  'Zustimmen',
  'Einverstanden',
  'Accept all',
  'Accept',
  'Agree',
  'I agree',
  'OK',
  'Got it',
  'Allow all',
  'Alle Cookies akzeptieren'
];

function consentPattern(): RegExp {
  const escaped = CONSENT_TEXTS.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^(${escaped.join('|')})$`, 'i');
}

interface ConsentMatch {
  readonly locator: Locator;
  readonly text: string;
}

async function findConsentButton(page: Page): Promise<ConsentMatch | null> {
  const pattern = consentPattern();

  for (const frame of page.frames()) {
    const candidate = frame
      .locator('button, [role="button"], a')
      .filter({ hasText: pattern })
      .first();

    const count = await candidate.count();
    if (count === 0) {
      continue;
    }

    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    const text = (await candidate.innerText()).trim();
    return { locator: candidate, text };
  }

  return null;
}

/* An ad-heavy page may never fire `load`: the event waits on every tracker and
   ad iframe, and some of those never settle: a news site that answers in ~5s
   can still time out a 60s `load` wait. The screenshot only needs the page
   painted, so fall back to `domcontentloaded` and let the fixed settle wait do
   the rest, rather than failing the capture of a perfectly reachable page. */
async function loadAndSettle(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    if (!(error instanceof Error) || !/Timeout/i.test(error.message)) throw error;
    console.error(`js: "load" did not fire for ${url} within ${NAVIGATION_TIMEOUT_MS}ms - falling back to domcontentloaded`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  }
  await page.waitForTimeout(FIXED_LOAD_WAIT_MS);
}

interface JsOnCapture {
  readonly on: string;
  readonly onAfterConsent?: string;
  readonly consentButtonText?: string;
}

async function captureJsOn(browser: Browser, page: PageSpec, runDir: string): Promise<JsOnCapture> {
  const context = await iPhone13Context(browser, { javaScriptEnabled: true });
  const tab = await context.newPage();

  try {
    await loadAndSettle(tab, page.url);

    const onRelative = `shots/${page.slug}-js-on.png`;
    await tab.screenshot({ path: join(runDir, onRelative), fullPage: false });

    const consent = await findConsentButton(tab);
    if (!consent) {
      return { on: onRelative };
    }

    await consent.locator.click();
    await tab.waitForTimeout(CONSENT_CLICK_WAIT_MS);

    const afterRelative = `shots/${page.slug}-js-on-after.png`;
    await tab.screenshot({ path: join(runDir, afterRelative), fullPage: false });

    return { on: onRelative, onAfterConsent: afterRelative, consentButtonText: consent.text };
  } finally {
    await context.close();
  }
}

async function captureJsOff(browser: Browser, page: PageSpec, runDir: string): Promise<string> {
  const context = await iPhone13Context(browser, { javaScriptEnabled: false });
  const tab = await context.newPage();

  try {
    await loadAndSettle(tab, page.url);

    const offRelative = `shots/${page.slug}-js-off.png`;
    await tab.screenshot({ path: join(runDir, offRelative), fullPage: false });
    return offRelative;
  } finally {
    await context.close();
  }
}

export async function captureJs(browser: Browser, page: PageSpec, runDir: string): Promise<JsResult> {
  await mkdir(join(runDir, 'shots'), { recursive: true });

  const on = await captureJsOn(browser, page, runDir);
  const off = await captureJsOff(browser, page, runDir);

  return {
    on: on.on,
    off,
    ...(on.onAfterConsent === undefined ? {} : { onAfterConsent: on.onAfterConsent }),
    ...(on.consentButtonText === undefined ? {} : { consentButtonText: on.consentButtonText })
  };
}
