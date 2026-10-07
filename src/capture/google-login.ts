import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { assertLoggedIn, consoleHomeUrl } from './gsc-ui.js';
import { newSessionPage, openGoogleSession } from './google-session.js';

/* `seo-tests-deck login`: opens Playwright's own Chromium as a plain browser
   (no automation attached, so Google's sign-in page treats it like any other
   browser) on the persistent profile the gsc test later reuses headless. The
   cookie store flags are the ones Playwright itself launches Chromium with,
   otherwise the headless capture could not decrypt the cookies written here. */

const PROFILE_FLAGS = ['--password-store=basic', '--use-mock-keychain', '--no-first-run', '--no-default-browser-check'];
const SETTLE_MS = 3_000;

function waitForExit(executable: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', () => resolve());
  });
}

export async function verifyGoogleProfile(dir: string): Promise<void> {
  const session = await openGoogleSession({ kind: 'profile', dir });
  try {
    const page = await newSessionPage(session, { width: 1400, height: 1000 });
    await page.goto(consoleHomeUrl(), { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);
    await assertLoggedIn(page);
  } finally {
    await session.close();
  }
}

export async function runGoogleLogin(dir: string): Promise<void> {
  const executable = chromium.executablePath();
  if (!existsSync(executable)) throw new Error(`Chromium not found at ${executable}. Run "npx playwright install chromium" first`);
  await mkdir(dir, { recursive: true });
  console.log(`Opening Chromium on the profile ${dir}`);
  console.log('1. Sign in to the Google account that can see your Search Console property.');
  console.log('2. Check that Search Console shows your property.');
  console.log('3. Quit the browser (close every window; on macOS press Cmd+Q). This command then verifies the login.');
  await waitForExit(executable, [`--user-data-dir=${dir}`, ...PROFILE_FLAGS, consoleHomeUrl()]);
  await verifyGoogleProfile(dir);
  console.log(`Logged in. The gsc test now uses ${dir}`);
}
