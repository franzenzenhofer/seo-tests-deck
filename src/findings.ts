import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Manifest } from './manifest.js';

export type TestStatus = 'ok' | 'not-ok';

export interface TestFinding {
  readonly status: TestStatus;
  readonly is: readonly string[];
  readonly should: readonly string[];
}

const HIGHLIGHT_SHOTS = ['on', 'onAfterConsent', 'off'] as const;
export type HighlightShot = (typeof HIGHLIGHT_SHOTS)[number];

export interface JsFinding extends TestFinding {
  readonly highlight: readonly HighlightShot[];
}

export interface PageFindings {
  readonly psi?: TestFinding;
  readonly js?: JsFinding;
  readonly gsc?: TestFinding;
}

export interface Findings {
  readonly brand: string;
  readonly date: string;
  readonly pages: Readonly<Record<string, PageFindings>>;
}

const FINDINGS_FILE = 'findings.json';
const DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/;

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Findings field "${field}" must be a non-empty string`);
  }
  return value;
}

function assertStatus(value: unknown, field: string): TestStatus {
  if (value !== 'ok' && value !== 'not-ok') {
    throw new Error(`Findings field "${field}" must be "ok" or "not-ok"`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Findings field "${field}" must be an array of strings`);
  }
  return value as readonly string[];
}

function assertHighlightArray(value: unknown, field: string): readonly HighlightShot[] {
  const items = assertStringArray(value, field);
  for (const item of items) {
    if (!(HIGHLIGHT_SHOTS as readonly string[]).includes(item)) {
      throw new Error(`Findings field "${field}" has unknown shot "${item}"`);
    }
  }
  return items as readonly HighlightShot[];
}

function validateTestFinding(value: unknown, field: string): TestFinding {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Findings field "${field}" must be an object`);
  }
  const record = value as Record<string, unknown>;
  const status = assertStatus(record['status'], `${field}.status`);
  const is = assertStringArray(record['is'] ?? [], `${field}.is`);
  const should = assertStringArray(record['should'] ?? [], `${field}.should`);
  /* PSI has no notes block on its slide - its status only picks the border colour. */
  if (status === 'not-ok' && is.length === 0 && !field.endsWith('.psi')) {
    throw new Error(`Findings field "${field}" has status "not-ok" but an empty "is" array`);
  }
  return { status, is, should };
}

function validateJsFinding(value: unknown, field: string): JsFinding {
  const base = validateTestFinding(value, field);
  const record = value as Record<string, unknown>;
  const highlight = assertHighlightArray(record['highlight'] ?? [], `${field}.highlight`);
  return { ...base, highlight };
}

function assertKnownKeys(
  record: Record<string, unknown>,
  known: readonly string[],
  field: string
): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) {
      throw new Error(`Findings field "${field}" has unknown key "${key}"`);
    }
  }
}

function validatePageFindings(value: unknown, slug: string): PageFindings {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Findings for page "${slug}" must be an object`);
  }
  const record = value as Record<string, unknown>;
  assertKnownKeys(record, ['psi', 'js', 'gsc'], `pages.${slug}`);

  return {
    ...(record['psi'] === undefined
      ? {}
      : { psi: validateTestFinding(record['psi'], `pages.${slug}.psi`) }),
    ...(record['js'] === undefined
      ? {}
      : { js: validateJsFinding(record['js'], `pages.${slug}.js`) }),
    ...(record['gsc'] === undefined
      ? {}
      : { gsc: validateTestFinding(record['gsc'], `pages.${slug}.gsc`) })
  };
}

function assertPagesCoverManifest(
  pages: Readonly<Record<string, PageFindings>>,
  manifest: Manifest
): void {
  for (const page of manifest.pages) {
    if (pages[page.slug] === undefined) {
      throw new Error(`Findings is missing an entry for page slug "${page.slug}"`);
    }
  }
}

export async function readFindings(runDir: string, manifest: Manifest): Promise<Findings> {
  const path = join(runDir, FINDINGS_FILE);
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Findings must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;

  const brand = assertString(record['brand'], 'brand');
  const date = assertString(record['date'], 'date');
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`Findings field "date" must match DD.MM.YYYY, got "${date}"`);
  }

  const pagesValue = record['pages'];
  if (typeof pagesValue !== 'object' || pagesValue === null) {
    throw new Error('Findings field "pages" must be an object');
  }
  const pagesRecord = pagesValue as Record<string, unknown>;
  const pages: Record<string, PageFindings> = {};
  for (const [slug, value] of Object.entries(pagesRecord)) {
    pages[slug] = validatePageFindings(value, slug);
  }

  const findings: Findings = { brand, date, pages };
  assertPagesCoverManifest(findings.pages, manifest);
  return findings;
}
