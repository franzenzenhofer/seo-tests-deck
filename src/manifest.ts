import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PsiRun {
  readonly screenshot: string;
  readonly analysisUrl: string;
  readonly score: number;
}

/** The selected (worst) run plus every run when `--repeat` was used. */
export interface PsiResult {
  readonly screenshot: string;
  readonly analysisUrl: string;
  readonly score: number;
  readonly formFactor: 'mobile';
  readonly runs?: readonly PsiRun[];
}

export interface JsResult {
  readonly on: string;
  readonly onAfterConsent?: string;
  readonly off: string;
  readonly consentButtonText?: string;
}

export interface GscResult {
  readonly screenshot: string;
  readonly resources: string;
  readonly inspectUrl: string;
  readonly verdict: string;
  readonly resourcesStatus: string;
  /** Google's rendered screenshot itself (the image inside the Screenshot tab). */
  readonly render?: string;
  /** Side by side: real browser (JS on, after consent) vs Google's render - for the review step. */
  readonly renderCompare?: string;
}

export interface PageRun {
  readonly type: string;
  readonly url: string;
  readonly slug: string;
  readonly psi?: PsiResult;
  readonly js?: JsResult;
  readonly gsc?: GscResult;
  /** Captures that failed for this page, test name -> error message. The run goes on, the exit code says 1. */
  readonly errors?: Readonly<Record<string, string>>;
}

export interface Manifest {
  readonly site: { readonly brand: string; readonly origin: string };
  readonly capturedAt: string;
  readonly pages: readonly PageRun[];
}

const MANIFEST_FILE = 'manifest.json';

export function brandFromOrigin(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, '');
}

export async function writeManifest(runDir: string, manifest: Manifest): Promise<void> {
  const path = join(runDir, MANIFEST_FILE);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Manifest field "${field}" must be a non-empty string`);
  }
  return value;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Manifest field "${field}" must be a number`);
  }
  return value;
}

function validatePsi(psi: unknown, index: number): PsiResult {
  if (typeof psi !== 'object' || psi === null) {
    throw new Error(`pages[${index}].psi must be an object`);
  }
  const record = psi as Record<string, unknown>;
  const formFactor = record['formFactor'];
  if (formFactor !== 'mobile') {
    throw new Error(`pages[${index}].psi.formFactor must be "mobile"`);
  }
  const runs = record['runs'];
  return {
    screenshot: assertString(record['screenshot'], `pages[${index}].psi.screenshot`),
    analysisUrl: assertString(record['analysisUrl'], `pages[${index}].psi.analysisUrl`),
    score: assertNumber(record['score'], `pages[${index}].psi.score`),
    formFactor,
    ...(runs === undefined ? {} : { runs: validatePsiRuns(runs, index) })
  };
}

function validatePsiRuns(runs: unknown, index: number): readonly PsiRun[] {
  if (!Array.isArray(runs)) throw new Error(`pages[${index}].psi.runs must be an array`);
  return runs.map((run: unknown, k) => {
    if (typeof run !== 'object' || run === null) throw new Error(`pages[${index}].psi.runs[${k}] must be an object`);
    const r = run as Record<string, unknown>;
    return {
      screenshot: assertString(r['screenshot'], `pages[${index}].psi.runs[${k}].screenshot`),
      analysisUrl: assertString(r['analysisUrl'], `pages[${index}].psi.runs[${k}].analysisUrl`),
      score: assertNumber(r['score'], `pages[${index}].psi.runs[${k}].score`)
    };
  });
}

function validateJs(js: unknown, index: number): JsResult {
  if (typeof js !== 'object' || js === null) {
    throw new Error(`pages[${index}].js must be an object`);
  }
  const record = js as Record<string, unknown>;
  const result: JsResult = {
    on: assertString(record['on'], `pages[${index}].js.on`),
    off: assertString(record['off'], `pages[${index}].js.off`)
  };
  const onAfterConsent = record['onAfterConsent'];
  const consentButtonText = record['consentButtonText'];
  return {
    ...result,
    ...(onAfterConsent === undefined
      ? {}
      : { onAfterConsent: assertString(onAfterConsent, `pages[${index}].js.onAfterConsent`) }),
    ...(consentButtonText === undefined
      ? {}
      : {
          consentButtonText: assertString(
            consentButtonText,
            `pages[${index}].js.consentButtonText`
          )
        })
  };
}

function validateGsc(gsc: unknown, index: number): GscResult {
  if (typeof gsc !== 'object' || gsc === null) {
    throw new Error(`pages[${index}].gsc must be an object`);
  }
  const record = gsc as Record<string, unknown>;
  return {
    screenshot: assertString(record['screenshot'], `pages[${index}].gsc.screenshot`),
    resources: assertString(record['resources'], `pages[${index}].gsc.resources`),
    inspectUrl: assertString(record['inspectUrl'], `pages[${index}].gsc.inspectUrl`),
    verdict: assertString(record['verdict'], `pages[${index}].gsc.verdict`),
    resourcesStatus: assertString(record['resourcesStatus'], `pages[${index}].gsc.resourcesStatus`),
    ...(record['render'] === undefined ? {} : { render: assertString(record['render'], `pages[${index}].gsc.render`) }),
    ...(record['renderCompare'] === undefined
      ? {}
      : { renderCompare: assertString(record['renderCompare'], `pages[${index}].gsc.renderCompare`) })
  };
}

function validateErrors(errors: unknown, index: number): Readonly<Record<string, string>> {
  if (typeof errors !== 'object' || errors === null) {
    throw new Error(`pages[${index}].errors must be an object`);
  }
  const out: Record<string, string> = {};
  for (const [test, message] of Object.entries(errors as Record<string, unknown>)) {
    out[test] = assertString(message, `pages[${index}].errors.${test}`);
  }
  return out;
}

function validatePageRun(value: unknown, index: number): PageRun {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`pages[${index}] must be an object`);
  }
  const record = value as Record<string, unknown>;
  const base = {
    type: assertString(record['type'], `pages[${index}].type`),
    url: assertString(record['url'], `pages[${index}].url`),
    slug: assertString(record['slug'], `pages[${index}].slug`)
  };
  return {
    ...base,
    ...(record['psi'] === undefined ? {} : { psi: validatePsi(record['psi'], index) }),
    ...(record['js'] === undefined ? {} : { js: validateJs(record['js'], index) }),
    ...(record['gsc'] === undefined ? {} : { gsc: validateGsc(record['gsc'], index) }),
    ...(record['errors'] === undefined ? {} : { errors: validateErrors(record['errors'], index) })
  };
}

export async function readManifest(runDir: string): Promise<Manifest> {
  const path = join(runDir, MANIFEST_FILE);
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Manifest must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;

  const site = record['site'];
  if (typeof site !== 'object' || site === null) {
    throw new Error('Manifest field "site" must be an object');
  }
  const siteRecord = site as Record<string, unknown>;

  const pages = record['pages'];
  if (!Array.isArray(pages)) {
    throw new Error('Manifest field "pages" must be an array');
  }

  return {
    site: {
      brand: assertString(siteRecord['brand'], 'site.brand'),
      origin: assertString(siteRecord['origin'], 'site.origin')
    },
    capturedAt: assertString(record['capturedAt'], 'capturedAt'),
    pages: pages.map((page, index) => validatePageRun(page, index))
  };
}
