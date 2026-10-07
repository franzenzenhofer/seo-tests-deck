import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import { launchChromium } from '../capture/browser.js';

/* The review of the finished deck must LOOK at every slide, not at the
   markdown. `check` renders every slide of deck.html (the same Marp output the
   PDF is printed from) to check/slide-NN.png plus one contact sheet, so the
   reviewing agent reads them with its own eyes before handover. */

const SLIDE_W = 1920;
const SLIDE_H = 1080;
const SHEET_COLUMNS = 3;
const SHEET_SCALE = 0.25;

export interface CheckResult {
  readonly slides: readonly string[];
  readonly sheet: string;
  /** Text boxes whose content runs outside them, or elements outside the slide - one line each, empty when clean. */
  readonly overflows: readonly string[];
}

/* Measured in the real Chromium layout, not estimated: a text box whose
   content is taller or wider than the box, or any painted element that leaves
   the 1920x1080 slide, is a defect ("text can not be rendered outside").
   whitedeck rounds pt to px per box, so a line box may overrun its container
   by a few px of internal leading at large sizes (3px on a 112pt title) with
   every glyph still inside: the tolerance scales with the font size. */
const OVERFLOW_TOLERANCE_PX = 2;
const OVERFLOW_TOLERANCE_EM = 0.04;

const measureOverflows = async (page: Page, slideIndex: number): Promise<string[]> =>
  page.evaluate(
    ({ index, tolerance, toleranceEm }) => {
      const svg = document.querySelectorAll('svg[data-marpit-svg]')[index];
      const section = svg?.querySelector('section');
      if (section === null || section === undefined) return [`slide ${index + 1}: no <section> found`];
      const found: string[] = [];
      const snippet = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      for (const el of Array.from(section.querySelectorAll<HTMLElement>('.wd-text'))) {
        const fontPx = Number.parseFloat(getComputedStyle(el).fontSize);
        const slack = Math.max(tolerance, Math.round(fontPx * toleranceEm));
        if (el.scrollHeight > el.clientHeight + slack || el.scrollWidth > el.clientWidth + slack) {
          found.push(`slide ${index + 1}: text overflows its box (${el.scrollHeight}px in ${el.clientHeight}px): "${snippet(el)}"`);
        }
      }
      const bounds = section.getBoundingClientRect();
      for (const el of Array.from(section.querySelectorAll<HTMLElement>('.wd-custom > *'))) {
        const r = el.getBoundingClientRect();
        if (r.left < bounds.left - tolerance || r.top < bounds.top - tolerance || r.right > bounds.right + tolerance || r.bottom > bounds.bottom + tolerance) {
          found.push(`slide ${index + 1}: element leaves the slide (${el.tagName.toLowerCase()}.${el.className}): "${snippet(el)}"`);
        }
      }
      return found;
    },
    { index: slideIndex, tolerance: OVERFLOW_TOLERANCE_PX, toleranceEm: OVERFLOW_TOLERANCE_EM }
  );

const sheetHtml = (files: readonly string[]): string => {
  const w = Math.round(SLIDE_W * SHEET_SCALE);
  const cells = files
    .map((f, i) => `<figure style="margin:0"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:${w}px;border:1px solid #999"><figcaption style="font:14px Helvetica">${i + 1}</figcaption></figure>`)
    .join('');
  return `<!doctype html><body style="margin:0;background:#666"><div style="display:grid;grid-template-columns:repeat(${SHEET_COLUMNS},${w}px);gap:8px;padding:8px;width:fit-content">${cells}</div></body>`;
};

export async function checkDeck(deckDir: string): Promise<CheckResult> {
  const html = resolve(deckDir, 'deck.html');
  const outDir = resolve(deckDir, 'check');
  await mkdir(outDir, { recursive: true });
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({ viewport: { width: SLIDE_W, height: SLIDE_H }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const url = pathToFileURL(html).href;
    await page.goto(url, { waitUntil: 'load' });
    await page.addStyleTag({ content: '.bespoke-marp-osc, .bespoke-progress-parent { display: none !important; }' });
    const count = await page.locator('svg[data-marpit-svg]').count();
    if (count === 0) throw new Error(`no slides found in ${html}`);
    const slides: string[] = [];
    const overflows: string[] = [];
    /* Marp's presentation HTML shows one slide per #page anchor; at a 16:9
       viewport that slide fills the window, so the viewport IS the slide. */
    for (let i = 0; i < count; i += 1) {
      const file = join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
      await page.goto(`${url}#${i + 1}`, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: file });
      slides.push(file);
      overflows.push(...(await measureOverflows(page, i)));
    }
    const sheet = join(outDir, 'all-slides.png');
    const sheetPage = await context.newPage();
    await sheetPage.setContent(sheetHtml(slides), { waitUntil: 'load' });
    await sheetPage.locator('div').first().screenshot({ path: sheet });
    return { slides, sheet, overflows };
  } finally {
    await browser.close();
  }
}
