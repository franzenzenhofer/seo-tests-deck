import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_DIR, findOnPath, resolveGoogleSession } from './google-source.js';

const EMPTY_PATH = { PATH: mkdtempSync(join(tmpdir(), 'seo-empty-path-')) };

function pathWithSharedLogin(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), 'seo-path-'));
  const name = process.platform === 'win32' ? 'google-team-login.cmd' : 'google-team-login';
  writeFileSync(join(dir, name), '');
  return { PATH: dir, PATHEXT: '.CMD' };
}

describe('resolveGoogleSession', () => {
  it('defaults to the persistent profile when nothing else is configured', () => {
    expect(resolveGoogleSession({}, EMPTY_PATH)).toEqual({ kind: 'profile', dir: DEFAULT_PROFILE_DIR });
  });

  it('prefers --cdp over the env var, the profile and the PATH command', () => {
    const env = { ...pathWithSharedLogin(), SEO_TESTS_DECK_CDP: 'ws://env', SEO_TESTS_DECK_PROFILE: '/p' };
    expect(resolveGoogleSession({ cdp: 'ws://flag' }, env)).toEqual({ kind: 'cdp', url: 'ws://flag' });
    expect(resolveGoogleSession({}, env)).toEqual({ kind: 'cdp', url: 'ws://env' });
  });

  it('takes an explicit profile before any CDP command', () => {
    const env = { ...pathWithSharedLogin(), SEO_TESTS_DECK_CDP_COMMAND: 'my-browser cdp' };
    expect(resolveGoogleSession({ profile: '/flag' }, env)).toEqual({ kind: 'profile', dir: '/flag' });
  });

  it('splits SEO_TESTS_DECK_CDP_COMMAND into command and args', () => {
    expect(resolveGoogleSession({}, { ...EMPTY_PATH, SEO_TESTS_DECK_CDP_COMMAND: 'my-browser cdp --x' })).toEqual({
      kind: 'cdp-command',
      command: 'my-browser',
      args: ['cdp', '--x']
    });
  });

  it('auto-detects a google-team-login command on PATH', () => {
    expect(resolveGoogleSession({}, pathWithSharedLogin())).toEqual({ kind: 'cdp-command', command: 'google-team-login', args: ['cdp'] });
  });
});

describe('findOnPath', () => {
  it('finds node itself and misses an unknown command', () => {
    expect(findOnPath('node', process.env)).toBeDefined();
    expect(findOnPath('seo-tests-deck-no-such-command', process.env)).toBeUndefined();
  });
});
