import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Browser } from 'playwright';

/* Neutral screenshot fixtures, rendered by a real browser at test time: a
   labelled grey card of the size the real capture produces. */
export interface FixtureShot {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

export async function renderFixtureShot(browser: Browser, shot: FixtureShot): Promise<void> {
  await mkdir(dirname(shot.file), { recursive: true });
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
  try {
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#e8e8e8;font:bold 48px sans-serif">${shot.label}</body>`
    );
    await page.screenshot({ path: shot.file });
  } finally {
    await page.close();
  }
}
