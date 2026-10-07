import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface WhitedeckBuildResult {
  readonly stdout: string;
  readonly stderr: string;
}

/* whitedeck is a package dependency, run through the current node binary:
   no global install, no PATH lookup, and no shebang (Windows cannot exec a
   .js file directly). */
export function whitedeckCli(): string {
  const manifest = createRequire(import.meta.url).resolve('whitedeck/package.json');
  return join(dirname(manifest), 'dist', 'cli.js');
}

/* whitedeck prints PDFs through Marp, which needs a Chrome-family browser.
   The Chromium that Playwright installed for the capture is one on every
   platform; an explicit CHROME_PATH still wins. */
function browserEnv(): NodeJS.ProcessEnv {
  if (process.env['CHROME_PATH'] !== undefined) return process.env;
  const bundled = chromium.executablePath();
  return existsSync(bundled) ? { ...process.env, CHROME_PATH: bundled } : process.env;
}

const runWhitedeck = (args: readonly string[], cwd?: string): Promise<WhitedeckBuildResult> =>
  execFileAsync(process.execPath, [whitedeckCli(), ...args], { ...(cwd === undefined ? {} : { cwd }), env: browserEnv(), maxBuffer: MAX_OUTPUT_BYTES });

/* Formats go to whitedeck as given: "all" means every format this machine can
   produce (whitedeck skips .key off macOS), an explicitly named format that
   cannot be produced fails loud in whitedeck. Output is always deck.<ext>. */
export async function runWhitedeckBuild(deckDir: string, formats: string): Promise<WhitedeckBuildResult> {
  return runWhitedeck(['build', 'deck.md', '-f', formats, '-o', '.', '-n', 'deck'], deckDir);
}

export async function runWhitedeckValidate(deckPath: string): Promise<unknown> {
  const { stdout } = await runWhitedeck(['validate', deckPath]);
  return JSON.parse(stdout) as unknown;
}
