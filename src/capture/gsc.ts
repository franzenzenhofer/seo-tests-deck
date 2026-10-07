import { join } from 'node:path';
import type { GscResult } from '../manifest.js';
import type { PageSpec } from '../pages.js';
import { newSessionPage, type GoogleSession } from './google-session.js';
import { captureResources, mainPanel, saveRender, saveRenderCompare, screenshotLocator, shotPath } from './gsc-shots.js';
import {
  assertLoggedIn,
  consoleUrl,
  inspect,
  INSPECT_TIMEOUT_MS,
  openTestedPage,
  readResourcesStatus,
  readVerdict,
  runLiveTest,
  SETTLE_MS
} from './gsc-ui.js';

/* Google Search Console URL Inspection live test, driven through the web UI
   in the signed-in Google session: big shot = the "Tested page" screenshot
   drawer, small shot = the page-resources panel, plus Google's own render
   and a browser-vs-Google comparison image for the review. */

const VIEWPORT = { width: 1400, height: 1000 };

export interface GscOptions {
  /** GSC property, e.g. `sc-domain:example.com` or `https://www.example.com/`. */
  readonly property: string;
  /** Real-browser screenshot (JS on, after consent) to put next to Google's render. */
  readonly browserShot?: string;
}

interface CompareInput {
  readonly browserShot: string | undefined;
  readonly runDir: string;
  readonly slug: string;
  readonly render: string;
}

async function compareRender(session: GoogleSession, input: CompareInput): Promise<string | undefined> {
  if (input.browserShot === undefined) return undefined;
  const page = await newSessionPage(session, VIEWPORT);
  try {
    await saveRenderCompare(page, join(input.runDir, input.browserShot), input.render, shotPath(input.runDir, input.slug, '-render-compare'));
  } finally {
    await page.close();
  }
  return `shots/${input.slug}-gsc-render-compare.png`;
}

export async function captureGsc(session: GoogleSession, page: PageSpec, runDir: string, options: GscOptions): Promise<GscResult> {
  const tab = await newSessionPage(session, VIEWPORT);
  try {
    await tab.goto(consoleUrl(options.property), { waitUntil: 'load', timeout: INSPECT_TIMEOUT_MS });
    await tab.waitForTimeout(SETTLE_MS);
    await assertLoggedIn(tab);
    await inspect(tab, page.url);
    await runLiveTest(tab, page.url);
    const verdict = await readVerdict(tab);
    const resourcesStatus = await readResourcesStatus(tab);
    await openTestedPage(tab, /screenshot/i);
    await screenshotLocator(await mainPanel(tab), shotPath(runDir, page.slug, ''));
    const render = shotPath(runDir, page.slug, '-render');
    await saveRender(tab, render);
    await captureResources(tab, shotPath(runDir, page.slug, '-resources'));
    const inspectUrl = tab.url();
    const compare = await compareRender(session, { browserShot: options.browserShot, runDir, slug: page.slug, render });
    return {
      screenshot: `shots/${page.slug}-gsc.png`,
      resources: `shots/${page.slug}-gsc-resources.png`,
      inspectUrl,
      verdict,
      resourcesStatus,
      render: `shots/${page.slug}-gsc-render.png`,
      ...(compare === undefined ? {} : { renderCompare: compare })
    };
  } finally {
    await tab.close();
  }
}
