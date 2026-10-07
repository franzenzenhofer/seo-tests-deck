import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readFindings } from '../findings.js';
import { readManifest } from '../manifest.js';
import { DEFAULT_AUTHOR, defaultBrandLogo } from './asset-paths.js';
import { copyDeckAssets } from './copy-assets.js';
import { buildDeckMarkdown } from './deck-md.js';
import { buildFindingsTemplate } from './findings-template.js';
import { runWhitedeckBuild } from './run-whitedeck.js';

/* "all" = every format whitedeck can produce on this machine. */
const DEFAULT_FORMATS = 'all';
const STRING = { type: 'string' } as const;
const BUILD_OPTIONS = { run: STRING, out: STRING, formats: STRING, author: STRING, logo: STRING };

export async function runBuild(argv: readonly string[]): Promise<void> {
  const { values } = parseArgs({ args: [...argv], options: BUILD_OPTIONS });
  if (values.run === undefined || values.out === undefined) throw new Error('build requires --run <runDir> and --out <deckDir>');
  if (values.logo !== undefined && !/\.png$/i.test(values.logo)) throw new Error(`--logo must be a .png file, got "${values.logo}"`);
  const manifest = await readManifest(values.run);
  const findings = await readFindings(values.run, manifest);
  const deckMarkdown = buildDeckMarkdown(manifest, findings, { author: values.author ?? DEFAULT_AUTHOR });
  await copyDeckAssets(values.run, values.out, manifest, values.logo ?? defaultBrandLogo());
  await writeFile(join(values.out, 'deck.md'), deckMarkdown, 'utf8');
  const result = await runWhitedeckBuild(values.out, values.formats ?? DEFAULT_FORMATS);
  process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
}

export async function runFindingsTemplate(argv: readonly string[]): Promise<void> {
  const { values } = parseArgs({ args: [...argv], options: { run: STRING } });
  if (values.run === undefined) throw new Error('findings-template requires --run <runDir>');
  const manifest = await readManifest(values.run);
  process.stdout.write(`${JSON.stringify(buildFindingsTemplate(manifest), null, 2)}\n`);
}
