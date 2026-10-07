import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { describeSource, type GoogleSessionSource } from './google-source.js';

/* The gsc test needs a browser that is signed in to a Google account with
   access to the Search Console property. Three pluggable sources (resolved in
   google-source.ts): a persistent Playwright profile written once by
   `seo-tests-deck login` (the default), an already running browser reached
   over CDP (--cdp / SEO_TESTS_DECK_CDP), or a command that prints such a CDP
   url (SEO_TESTS_DECK_CDP_COMMAND). Cookies are never copied between
   browsers: Google treats a second browser presenting the same session
   cookies as session theft and revokes the session for every holder. */

const CDP_COMMAND_TIMEOUT_MS = 240_000;

export interface GoogleSession {
  readonly context: BrowserContext;
  readonly label: string;
  close(): Promise<void>;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/* Runs the CDP command; its last stdout line must be the browser's CDP
   websocket url. On Windows a .cmd shim only runs through the shell. */
export function cdpUrlFromCommand(command: string, args: readonly string[]): string {
  let output: string;
  try {
    output = execFileSync(command, [...args], {
      encoding: 'utf8',
      timeout: CDP_COMMAND_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`"${[command, ...args].join(' ')}" failed: ${message}`);
  }
  const url = output.trim().split(/\r?\n/).at(-1) ?? '';
  if (!/^wss?:\/\//.test(url)) throw new Error(`"${[command, ...args].join(' ')}" printed no CDP websocket url: "${output.trim()}"`);
  return url;
}

async function connectCdp(url: string, label: string): Promise<GoogleSession> {
  const browser = await chromium.connectOverCDP(url);
  const context = browser.contexts()[0];
  if (context === undefined) {
    await browser.close();
    throw new Error(`the browser at ${url} has no default context`);
  }
  /* For a connectOverCDP browser, close() only drops this process's
     connection: the remote browser and its login stay alive. */
  return { context, label, close: () => browser.close() };
}

/* Headless Chromium announces itself as "HeadlessChrome" in its user agent;
   the profile was signed in by the headed browser, so present the same name. */
async function launchProfile(dir: string, label: string): Promise<GoogleSession> {
  if (!existsSync(dir)) {
    throw new Error(`no Google profile at ${dir}. Run "seo-tests-deck login" once and sign in to the Google account that sees your Search Console property`);
  }
  const context = await chromium.launchPersistentContext(dir, { headless: true, locale: 'en-US' });
  const probe = context.pages()[0] ?? (await context.newPage());
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await context.setExtraHTTPHeaders({ 'user-agent': userAgent });
  return { context, label, close: () => context.close() };
}

export async function openGoogleSession(source: GoogleSessionSource): Promise<GoogleSession> {
  const label = describeSource(source);
  if (source.kind === 'cdp') return connectCdp(source.url, label);
  if (source.kind === 'cdp-command') return connectCdp(cdpUrlFromCommand(source.command, source.args), label);
  return launchProfile(source.dir, label);
}

/* A page in a browser this tool did not launch has the window's size; the
   CDP override pins the viewport on this one page. The override lives as long
   as its CDP session, so the session stays attached until the page closes. */
export async function newSessionPage(session: GoogleSession, viewport: Viewport): Promise<Page> {
  const page = await session.context.newPage();
  const cdp = await session.context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  return page;
}
