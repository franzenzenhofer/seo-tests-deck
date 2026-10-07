import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFindings } from './findings.js';
import type { Manifest } from './manifest.js';

const MANIFEST: Manifest = {
  site: { brand: 'example.com', origin: 'https://example.com/' },
  capturedAt: new Date().toISOString(),
  pages: [
    { type: 'Start Page', url: 'https://example.com/', slug: 'start-page' },
    { type: 'Detail Page', url: 'https://example.com/a', slug: 'detail-page' }
  ]
};

async function writeFindingsFile(runDir: string, data: unknown): Promise<void> {
  await writeFile(join(runDir, 'findings.json'), JSON.stringify(data), 'utf8');
}

describe('readFindings', () => {
  let runDir: string;

  beforeEach(async () => {
    runDir = await mkdtemp(join(tmpdir(), 'seo-tests-deck-findings-'));
  });

  afterEach(async () => {
    await rm(runDir, { recursive: true, force: true });
  });

  it('round-trips a valid findings file', async () => {
    const data = {
      brand: 'example.com',
      date: '27.05.2024',
      pages: {
        'start-page': { psi: { status: 'ok', is: [], should: [] } },
        'detail-page': {
          js: { status: 'not-ok', is: ['cookie banner shown'], should: ['hide it'], highlight: ['on'] }
        }
      }
    };
    await writeFindingsFile(runDir, data);

    const findings = await readFindings(runDir, MANIFEST);
    expect(findings.brand).toBe('example.com');
    expect(findings.pages['detail-page']?.js?.highlight).toEqual(['on']);
  });

  it('throws when a manifest page slug has no findings entry', async () => {
    await writeFindingsFile(runDir, {
      brand: 'example.com',
      date: '27.05.2024',
      pages: {
        'start-page': { psi: { status: 'ok', is: [], should: [] } }
      }
    });

    await expect(readFindings(runDir, MANIFEST)).rejects.toThrow(/detail-page/);
  });

  it('throws when status is "not-ok" but "is" is empty', async () => {
    await writeFindingsFile(runDir, {
      brand: 'example.com',
      date: '27.05.2024',
      pages: {
        'start-page': { js: { status: 'not-ok', is: [], should: [], highlight: [] } },
        'detail-page': {}
      }
    });

    await expect(readFindings(runDir, MANIFEST)).rejects.toThrow(/not-ok/);
  });

  it('throws on an unknown highlight shot value', async () => {
    await writeFindingsFile(runDir, {
      brand: 'example.com',
      date: '27.05.2024',
      pages: {
        'start-page': { js: { status: 'ok', is: [], should: [], highlight: ['nope'] } },
        'detail-page': {}
      }
    });

    await expect(readFindings(runDir, MANIFEST)).rejects.toThrow(/highlight/);
  });

  it('throws on a malformed date', async () => {
    await writeFindingsFile(runDir, {
      brand: 'example.com',
      date: '2024-05-27',
      pages: { 'start-page': {}, 'detail-page': {} }
    });

    await expect(readFindings(runDir, MANIFEST)).rejects.toThrow(/date/);
  });

  it('throws on an unknown key inside a page findings object', async () => {
    await writeFindingsFile(runDir, {
      brand: 'example.com',
      date: '27.05.2024',
      pages: { 'start-page': { bogus: {} }, 'detail-page': {} }
    });

    await expect(readFindings(runDir, MANIFEST)).rejects.toThrow(/bogus/);
  });
});
