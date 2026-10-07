import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDeck } from './check.js';

describe('checkDeck overflow measurement', () => {
  /* Threshold-crossing fixtures in Marp's own HTML shape: the same box with
     text that fits and text that does not; the check measures, not guesses. */
  const marpFixture = (boxHeightPx: number, text: string): string =>
    '<!doctype html><body style="margin:0"><svg data-marpit-svg viewBox="0 0 1920 1080" style="width:1920px;height:1080px"><foreignObject width="1920" height="1080">' +
    '<section style="width:1920px;height:1080px;position:relative;overflow:hidden;background:#fff"><div class="wd-custom" style="position:absolute;inset:0">' +
    `<div class="wd-text" style="position:absolute;left:100px;top:100px;width:400px;height:${boxHeightPx}px;font:32px Helvetica;overflow:hidden">${text}</div>` +
    '</div></section></foreignObject></svg></body>';

  it('reports a text box whose content runs outside it, and nothing for one that fits', async () => {
    const fits = mkdtempSync(join(tmpdir(), 'seo-check-fits-'));
    writeFileSync(join(fits, 'deck.html'), marpFixture(120, 'two short lines'));
    expect((await checkDeck(fits)).overflows).toEqual([]);

    const overflows = mkdtempSync(join(tmpdir(), 'seo-check-over-'));
    writeFileSync(join(overflows, 'deck.html'), marpFixture(40, 'a text that is far too long for a box of forty pixels and must wrap into several lines'));
    const result = await checkDeck(overflows);
    expect(result.overflows).toHaveLength(1);
    expect(result.overflows[0]).toMatch(/^slide 1: text overflows its box \(\d+px in 40px\): "a text that is far too long/);
  }, 60_000);
});
