import type { Page } from 'playwright';
import { mergeFailedResources, parseFailedResources, type FailedResource } from './gsc-resources-parse.js';

/* Reads the open "Page resources" panel as structured data. The list may be
   virtualised, so the panel's scrollable elements are scrolled step by step
   and every read is merged. */

const SCROLL_STEPS = 40;
const SCROLL_SETTLE_MS = 400;

const readPanelText = (page: Page): Promise<string> =>
  page.locator('div[data-leave-open-on-resize]').last().evaluate((el: Element) => (el as HTMLElement).innerText);

const scrollPanelDown = (page: Page): Promise<boolean> =>
  page.locator('div[data-leave-open-on-resize]').last().evaluate((el: Element) => {
    let moved = false;
    for (const node of [el, ...el.querySelectorAll('*')]) {
      const box = node as HTMLElement;
      if (box.scrollHeight <= box.clientHeight + 4) continue;
      const before = box.scrollTop;
      box.scrollTop = before + box.clientHeight;
      if (box.scrollTop !== before) moved = true;
    }
    return moved;
  });

export const readFailedResources = async (page: Page): Promise<readonly FailedResource[]> => {
  const reads: (readonly FailedResource[])[] = [parseFailedResources(await readPanelText(page))];
  for (let step = 0; step < SCROLL_STEPS; step += 1) {
    if (!(await scrollPanelDown(page))) break;
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    reads.push(parseFailedResources(await readPanelText(page)));
  }
  return mergeFailedResources(reads);
};
