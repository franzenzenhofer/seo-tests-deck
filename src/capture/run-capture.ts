import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { brandFromOrigin, writeManifest, type PageRun } from '../manifest.js';
import { parsePages, type PageSpec } from '../pages.js';
import { launchChromium } from './browser.js';
import { openGoogleSession, type GoogleSession } from './google-session.js';
import { describeSource, type GoogleSessionSource } from './google-source.js';
import { captureGsc } from './gsc.js';
import { captureJs } from './js.js';
import { mergeRuns, previousPages } from './merge-runs.js';
import { capturePsi } from './psi.js';

export const KNOWN_TESTS = ['psi', 'js', 'gsc'] as const;
export type TestName = (typeof KNOWN_TESTS)[number];

export interface CaptureRequest {
  readonly pagesFile: string;
  readonly runDir: string;
  readonly tests: readonly TestName[];
  /** GSC property; required when tests include gsc. */
  readonly property?: string;
  readonly google: GoogleSessionSource;
  /** PSI runs per page; the worst run is selected for the slide. */
  readonly repeat: number;
}

/* The Google session is opened on the first gsc test only, so psi and js
   never need a Google login. */
class Runner {
  private session: GoogleSession | undefined;
  constructor(private readonly browser: Browser, private readonly request: CaptureRequest) {}

  private async google(): Promise<GoogleSession> {
    if (this.session === undefined) {
      console.log(`gsc: using ${describeSource(this.request.google)}`);
      this.session = await openGoogleSession(this.request.google);
    }
    return this.session;
  }

  async test(test: TestName, page: PageSpec, sofar: PageRun): Promise<PageRun> {
    const { runDir, property, repeat } = this.request;
    const base = { type: page.type, url: page.url, slug: page.slug };
    if (test === 'gsc') {
      if (property === undefined) throw new Error('the gsc test needs --property <GSC property>');
      const browserShot = sofar.js?.onAfterConsent ?? sofar.js?.on;
      const gsc = await captureGsc(await this.google(), page, runDir, { property, ...(browserShot === undefined ? {} : { browserShot }) });
      console.log(`gsc: ${page.type} -> ${gsc.screenshot} (${gsc.verdict}; ${gsc.resourcesStatus})`);
      return { ...base, gsc };
    }
    if (test === 'psi') {
      const psi = await capturePsi(this.browser, page, runDir, repeat);
      const range = psi.runs === undefined ? '' : ` worst of ${psi.runs.length}: ${psi.runs.map((r) => r.score).join('/')}`;
      console.log(`psi: ${page.type} -> ${psi.screenshot} (score ${psi.score}${range})`);
      return { ...base, psi };
    }
    const js = await captureJs(this.browser, page, runDir);
    console.log(`js: ${page.type} -> ${js.on}, ${js.off}`);
    return { ...base, js };
  }

  /* One failing capture must not throw away the others: the error is recorded
     per page and test in the manifest and the run continues. */
  async page(page: PageSpec): Promise<PageRun> {
    let run: PageRun = { type: page.type, url: page.url, slug: page.slug };
    for (const test of this.request.tests) {
      try {
        run = { ...run, ...(await this.test(test, page, run)) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${test}: ${page.type} FAILED - ${message}`);
        run = { ...run, errors: { ...(run.errors ?? {}), [test]: message } };
      }
    }
    return run;
  }

  async close(): Promise<void> {
    await this.session?.close();
  }
}

async function readPages(file: string): Promise<{ pages: readonly PageSpec[]; origin: string }> {
  const pages = parsePages(await readFile(file, 'utf8'));
  const first = pages[0];
  if (first === undefined) throw new Error('No pages parsed from batch file');
  return { pages, origin: new URL(first.url).origin };
}

export async function runCapture(request: CaptureRequest): Promise<void> {
  if (request.tests.includes('gsc') && request.property === undefined) {
    throw new Error('the gsc test needs --property <GSC property>, e.g. sc-domain:example.com');
  }
  const { pages, origin } = await readPages(request.pagesFile);
  await mkdir(join(request.runDir, 'shots'), { recursive: true });
  const previous = await previousPages(request.runDir);
  const browser = await launchChromium();
  const runner = new Runner(browser, request);
  const runs: PageRun[] = [];
  try {
    for (const page of pages) {
      runs.push(await runner.page(page));
      const manifest = { site: { brand: brandFromOrigin(origin), origin }, capturedAt: new Date().toISOString(), pages: mergeRuns(previous, runs) };
      await writeManifest(request.runDir, manifest);
    }
  } finally {
    await runner.close();
    await browser.close();
  }
  const failed = runs.flatMap((run) => Object.entries(run.errors ?? {}).map(([test, msg]) => `${run.type} / ${test}: ${msg}`));
  if (failed.length > 0) throw new Error(`${failed.length} capture(s) failed (manifest.json keeps the rest):\n  ${failed.join('\n  ')}`);
}
