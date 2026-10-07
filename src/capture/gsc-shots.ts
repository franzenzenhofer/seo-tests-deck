import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from 'playwright';
import { SETTLE_MS } from './gsc-ui.js';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/* The page-resources panel is ~400 CSS px wide with ~11px text and gets
   contain-fitted into a 388x501pt slide panel: at 1x the resource URLs and
   the "N/M couldn't be loaded" line are illegible on the slide. The Google
   session is often a browser this tool did not launch, whose pages cannot get
   a deviceScaleFactor, so the shot is taken at 2x through CDP directly. */
const SHOT_SCALE = 2;

export const screenshotBox = async (page: Page, box: Box, file: string): Promise<void> => {
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const cdp = await page.context().newCDPSession(page);
  try {
    const clip = { x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height, scale: SHOT_SCALE };
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    writeFileSync(file, Buffer.from(data, 'base64'));
  } finally {
    await cdp.detach();
  }
};

export const screenshotLocator = async (locator: Locator, file: string): Promise<void> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`no bounding box for the element to capture into ${file}`);
  await screenshotBox(locator.page(), box, file);
};

/* The content area right of the navigation, with the "Tested page" drawer
   open - what the 2024 reference deck shows. */
export const mainPanel = async (page: Page): Promise<Locator> => {
  const panels = page.locator('div[data-leave-open-on-resize]');
  const count = await panels.count();
  for (let i = 0; i < count; i += 1) {
    const box = await panels.nth(i).boundingBox();
    if (box !== null && box.width > 800) return panels.nth(i);
  }
  throw new Error('GSC main content panel not found');
};

export const shotPath = (runDir: string, slug: string, suffix: string): string => join(runDir, 'shots', `${slug}-gsc${suffix}.png`);

/* Google's own render is a base64 PNG inside the Screenshot tab - saved as is
   so the review can compare it pixel by pixel. */
const RENDER_MIN_WIDTH = 300;
const RENDER_TIMEOUT_MS = 30_000;

/* The render is not inside the tab's role="tabpanel" element (probed
   2026-09-11: a 412x1744 data-URL img in the drawer, tabpanel-less), so it is
   found by what it IS: the only big data-URL image on the page. */
export const saveRender = async (page: Page, file: string): Promise<void> => {
  await page.locator('img[src^="data:image"]').first().waitFor({ timeout: RENDER_TIMEOUT_MS });
  const sources = await page.locator('img[src^="data:image"]').evaluateAll((imgs, minWidth) =>
    (imgs as HTMLImageElement[])
      .filter((img) => img.naturalWidth >= (minWidth as number))
      .sort((a, b) => b.naturalHeight - a.naturalHeight)
      .map((img) => img.src), RENDER_MIN_WIDTH);
  const src = sources[0];
  if (src === undefined) throw new Error(`GSC rendered screenshot image (data URL, >= ${RENDER_MIN_WIDTH}px wide) not found`);
  const base64 = src.split(';base64,')[1];
  if (base64 === undefined) throw new Error('GSC rendered screenshot is not a base64 data URL');
  writeFileSync(file, Buffer.from(base64, 'base64'));
};

const dataUrl = (file: string): string => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

/* The review must SEE both renders side by side: real browser left, Google
   right, same height. Composed by the browser itself - no image library. */
const COMPARE_HEIGHT = 1200;
export const saveRenderCompare = async (page: Page, browserShot: string, render: string, file: string): Promise<void> => {
  const html = `<!doctype html><body style="margin:0;background:#fff;font:bold 28px Helvetica,Arial">
<div style="display:flex;gap:24px;padding:16px">
<figure style="margin:0"><figcaption style="padding:8px 0">Browser (JS on, after consent)</figcaption><img style="height:${COMPARE_HEIGHT}px;border:2px solid #ccc" src="${dataUrl(browserShot)}"></figure>
<figure style="margin:0"><figcaption style="padding:8px 0">Google render (GSC live test)</figcaption><img style="height:${COMPARE_HEIGHT}px;border:2px solid #ccc" src="${dataUrl(render)}"></figure>
</div></body>`;
  await page.setViewportSize({ width: 1600, height: COMPARE_HEIGHT + 120 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.locator('div').first().screenshot({ path: file });
};

export const captureResources = async (page: Page, file: string): Promise<void> => {
  await page.locator('div[role="tab"]').filter({ hasText: /more info/i }).last().click();
  await page.waitForTimeout(SETTLE_MS);
  await page.locator('div[role="button"]').filter({ hasText: /Page resources/i }).last().click();
  await page.waitForTimeout(SETTLE_MS);
  const panel = page.locator('div[data-leave-open-on-resize]').last();
  const box = await panel.boundingBox();
  if (box === null) throw new Error('GSC page-resources panel has no bounding box');
  /* Trim the panel to its content: the lowest text-bearing element. */
  const bottom = await panel.evaluate((el: Element) => {
    let max = el.getBoundingClientRect().top + 120;
    for (const node of el.querySelectorAll('*')) {
      const r = node.getBoundingClientRect();
      if (r.height > 0 && r.height < 400 && (node.textContent ?? '').trim().length > 0) max = Math.max(max, r.bottom);
    }
    return max;
  });
  const height = Math.min(box.height, bottom - box.y + 16);
  await screenshotBox(page, { x: box.x, y: box.y, width: box.width, height }, file);
};
