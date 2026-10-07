import { chromium, devices, type Browser, type BrowserContext } from 'playwright';

export async function launchChromium(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/* Headless Chromium says "HeadlessChrome" in its user agent, and
   pagespeed.web.dev answers that with HTTP 429 (verified 2026-10-07 on two
   networks: same run, same IP, plain "Chrome" user agent = report). */
export async function desktopUserAgent(browser: Browser): Promise<string> {
  const page = await browser.newPage();
  try {
    return (await page.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  } finally {
    await page.close();
  }
}

export interface IPhoneContextOptions {
  readonly javaScriptEnabled: boolean;
}

export async function iPhone13Context(
  browser: Browser,
  options: IPhoneContextOptions
): Promise<BrowserContext> {
  const device = devices['iPhone 13'];
  if (!device) {
    throw new Error('Playwright device descriptor "iPhone 13" is not available');
  }

  return browser.newContext({
    ...device,
    javaScriptEnabled: options.javaScriptEnabled
  });
}
