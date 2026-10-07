import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/* Where the signed-in Google browser for the gsc test comes from. Resolution
   order, first match wins:
   1. --cdp <ws-url> or SEO_TESTS_DECK_CDP       connect to a running browser
   2. --profile <dir> or SEO_TESTS_DECK_PROFILE   persistent profile
   3. SEO_TESTS_DECK_CDP_COMMAND                  a command printing a CDP url
   4. a `google-team-login` command on PATH       (one maintainer's shared
      browser; it prints its CDP url with `google-team-login cdp`)
   5. the default profile ~/.seo-tests-deck/google-profile (`seo-tests-deck login`) */

export type GoogleSessionSource =
  | { readonly kind: 'cdp'; readonly url: string }
  | { readonly kind: 'cdp-command'; readonly command: string; readonly args: readonly string[] }
  | { readonly kind: 'profile'; readonly dir: string };

export interface SessionFlags {
  readonly cdp?: string | undefined;
  readonly profile?: string | undefined;
}

export const DEFAULT_PROFILE_DIR = join(homedir(), '.seo-tests-deck', 'google-profile');
const SHARED_LOGIN_COMMAND = 'google-team-login';

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.trim().length === 0 ? undefined : value.trim();

/* PATH lookup without a shell, Windows included (PATHEXT: .EXE, .CMD, ...). */
export function findOnPath(command: string, env: NodeJS.ProcessEnv): string | undefined {
  const dirs = (env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter((dir) => dir.length > 0);
  const extensions = process.platform === 'win32' ? ['', ...(env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = join(dir, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function splitCommand(line: string): GoogleSessionSource {
  const [command, ...args] = line.split(/\s+/);
  if (command === undefined || command.length === 0) throw new Error('SEO_TESTS_DECK_CDP_COMMAND is empty');
  return { kind: 'cdp-command', command, args };
}

export function resolveGoogleSession(flags: SessionFlags, env: NodeJS.ProcessEnv): GoogleSessionSource {
  const cdp = nonEmpty(flags.cdp) ?? nonEmpty(env['SEO_TESTS_DECK_CDP']);
  if (cdp !== undefined) return { kind: 'cdp', url: cdp };
  const profile = nonEmpty(flags.profile) ?? nonEmpty(env['SEO_TESTS_DECK_PROFILE']);
  if (profile !== undefined) return { kind: 'profile', dir: profile };
  const command = nonEmpty(env['SEO_TESTS_DECK_CDP_COMMAND']);
  if (command !== undefined) return splitCommand(command);
  if (findOnPath(SHARED_LOGIN_COMMAND, env) !== undefined) return { kind: 'cdp-command', command: SHARED_LOGIN_COMMAND, args: ['cdp'] };
  return { kind: 'profile', dir: DEFAULT_PROFILE_DIR };
}

export function describeSource(source: GoogleSessionSource): string {
  if (source.kind === 'cdp') return `CDP browser at ${source.url}`;
  if (source.kind === 'cdp-command') return `CDP browser from "${[source.command, ...source.args].join(' ')}"`;
  return `Google profile ${source.dir}`;
}
