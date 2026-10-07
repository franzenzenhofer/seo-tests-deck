import type { Page } from 'playwright';

/* pagespeed.web.dev never says "blocked" on the page: when Google refuses a
   client, the analysis RPC answers HTTP 429 and the UI shows "Unable to
   resolve <url>" for any site (seen 2026-10-07 for a "HeadlessChrome" user
   agent, see browser.ts). So the wait ends on the report OR on an error
   panel, and a 429 is reported as the cause instead of a 2-minute timeout. */

const ERROR_TEXT = /Unable to resolve|Lighthouse returned error|Something went wrong|An error has occurred/i;

export interface RateLimitWatch {
  readonly seen: () => boolean;
}

export function watchRateLimit(tab: Page): RateLimitWatch {
  let limited = false;
  tab.on('response', (response) => {
    if (response.status() === 429 && response.url().startsWith('https://pagespeed.web.dev/')) limited = true;
  });
  return { seen: () => limited };
}

export async function waitForReport(tab: Page, watch: RateLimitWatch, timeoutMs: number): Promise<void> {
  const report = tab.locator('.lh-report').first();
  const error = tab.getByText(ERROR_TEXT).first();
  await report.or(error).waitFor({ state: 'visible', timeout: timeoutMs });
  if (await report.isVisible()) return;
  const shown = (await error.innerText()).replace(/\s+/g, ' ').trim();
  const cause = watch.seen()
    ? ' - pagespeed.web.dev answered HTTP 429: Google throttles PSI runs from this client or IP address; wait and retry later, or run from another network'
    : '';
  throw new Error(`pagespeed.web.dev shows "${shown}"${cause}`);
}
