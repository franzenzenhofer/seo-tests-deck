#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { checkDeck } from './build/check.js';
import { runBuild, runFindingsTemplate } from './build/cli-commands.js';
import { runGoogleLogin } from './capture/google-login.js';
import { DEFAULT_PROFILE_DIR, resolveGoogleSession } from './capture/google-source.js';
import { KNOWN_TESTS, runCapture, type TestName } from './capture/run-capture.js';

const HELP_TEXT = `seo-tests-deck capture --pages <file> --out <runDir> [--tests psi,js,gsc] [--property sc-domain:x] [--repeat 5] [--cdp <ws-url> | --profile <dir>]
seo-tests-deck findings-template --run <runDir>
seo-tests-deck build --run <runDir> --out <deckDir> [--formats all|html,pdf,pptx,key] [--author <name>] [--logo <png>]
seo-tests-deck check --deck <deckDir>            render every slide to check/slide-NN.png + all-slides.png, fail on overflow
seo-tests-deck login [--profile <dir>]           sign in to Google once for the gsc test

  --pages    Batch file, one "Page Type: URL" per line
  --out      Run directory for shots/ + manifest.json (capture), deck directory (build)
  --tests    Comma-separated tests (default: psi,js,gsc); psi and js need no Google login
  --property GSC property for the gsc test, e.g. sc-domain:example.com or https://www.example.com/
  --repeat   PSI runs per page, the worst run goes on the slide (default: 1, recommended: 5)
  --cdp      gsc test: connect to an already signed-in Chromium/Chrome over CDP (env SEO_TESTS_DECK_CDP)
  --profile  gsc test: persistent Google profile (env SEO_TESTS_DECK_PROFILE,
             default: ${DEFAULT_PROFILE_DIR})
  --run      Run directory with manifest.json (and findings.json for build)
  --formats  whitedeck formats, comma-separated, or "all" = every format this machine can produce (default: all)
  --author   Footer and deck author (default: f19n)
  --logo     PNG shown bottom-right on every slide (default: the bundled f19n logo)

seo-tests-deck --help   Show this message
`;

function parseTests(value: string): readonly TestName[] {
  const names = value.split(',').map((name) => name.trim());
  for (const name of names) {
    if (!(KNOWN_TESTS as readonly string[]).includes(name)) throw new Error(`Unknown test "${name}". Known tests: ${KNOWN_TESTS.join(', ')}`);
  }
  return names as readonly TestName[];
}

const STRING = { type: 'string' } as const;
const CAPTURE_OPTIONS = { pages: STRING, out: STRING, tests: STRING, property: STRING, repeat: STRING, cdp: STRING, profile: STRING };

async function capture(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: CAPTURE_OPTIONS });
  const repeat = values.repeat === undefined ? 1 : Number.parseInt(values.repeat, 10);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error(`--repeat must be a positive integer, got "${values.repeat}"`);
  if (values.pages === undefined || values.out === undefined) throw new Error('capture requires --pages <file> and --out <runDir>');
  await runCapture({
    pagesFile: values.pages,
    runDir: values.out,
    tests: parseTests(values.tests ?? 'psi,js,gsc'),
    ...(values.property === undefined ? {} : { property: values.property }),
    google: resolveGoogleSession({ cdp: values.cdp, profile: values.profile }, process.env),
    repeat
  });
}

async function check(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { deck: { type: 'string' } } });
  if (values.deck === undefined) throw new Error('check requires --deck <deckDir>');
  const result = await checkDeck(values.deck);
  for (const slide of result.slides) console.log(slide);
  console.log(result.sheet);
  if (result.overflows.length > 0) {
    throw new Error(`${result.overflows.length} overflow(s) found - nothing may render outside its box:\n  ${result.overflows.join('\n  ')}`);
  }
  console.log(`no overflow on ${result.slides.length} slides`);
}

async function login(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { profile: { type: 'string' } } });
  await runGoogleLogin(values.profile ?? process.env['SEO_TESTS_DECK_PROFILE'] ?? DEFAULT_PROFILE_DIR);
}

const COMMANDS: Readonly<Record<string, (argv: string[]) => Promise<void>>> = {
  capture,
  build: runBuild,
  'findings-template': runFindingsTemplate,
  check,
  login
};

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(HELP_TEXT);
    return;
  }
  const handler = COMMANDS[command];
  if (handler === undefined) throw new Error(`Unknown command "${command}". Run with --help for usage.`);
  await handler(rest);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
