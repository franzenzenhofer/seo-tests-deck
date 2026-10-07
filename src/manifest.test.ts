import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { brandFromOrigin, readManifest, writeManifest, type Manifest } from './manifest.js';

describe('brandFromOrigin', () => {
  it('strips www and returns the hostname', () => {
    expect(brandFromOrigin('https://www.example.com/')).toBe('example.com');
    expect(brandFromOrigin('https://loremipsum.franzai.com')).toBe('loremipsum.franzai.com');
  });
});

describe('writeManifest / readManifest', () => {
  let runDir: string;

  beforeEach(async () => {
    runDir = await mkdtemp(join(tmpdir(), 'seo-tests-deck-'));
  });

  afterEach(async () => {
    await rm(runDir, { recursive: true, force: true });
  });

  it('round-trips a full manifest', async () => {
    const manifest: Manifest = {
      site: { brand: 'example.com', origin: 'https://example.com/' },
      capturedAt: new Date().toISOString(),
      pages: [
        {
          type: 'Start Page',
          url: 'https://example.com/',
          slug: 'start-page',
          psi: {
            screenshot: 'shots/start-page-psi.png',
            analysisUrl: 'https://pagespeed.web.dev/analysis/abc?form_factor=mobile',
            score: 87,
            formFactor: 'mobile'
          },
          js: {
            on: 'shots/start-page-js-on.png',
            off: 'shots/start-page-js-off.png'
          }
        }
      ]
    };

    await writeManifest(runDir, manifest);
    const roundTripped = await readManifest(runDir);

    expect(roundTripped).toEqual(manifest);
  });

  it('throws when the manifest is missing a required field', async () => {
    await writeFile(
      join(runDir, 'manifest.json'),
      JSON.stringify({ site: {}, pages: [] }),
      'utf8'
    );
    await expect(readManifest(runDir)).rejects.toThrow(/brand/);
  });

  it('throws when a page psi block is malformed', async () => {
    await writeFile(
      join(runDir, 'manifest.json'),
      JSON.stringify({
        site: { brand: 'x', origin: 'https://x.com' },
        capturedAt: 'now',
        pages: [{ type: 't', url: 'u', slug: 's', psi: { formFactor: 'desktop' } }]
      }),
      'utf8'
    );
    await expect(readManifest(runDir)).rejects.toThrow(/formFactor/);
  });
});
