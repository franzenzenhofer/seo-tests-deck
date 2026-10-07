import type { Findings, JsFinding, PageFindings, TestFinding } from '../findings.js';
import type { Manifest, PageRun } from '../manifest.js';

const OK_TEST_FINDING: TestFinding = { status: 'ok', is: [], should: [] };
const OK_JS_FINDING: JsFinding = { status: 'ok', is: [], should: [], highlight: [] };

function formatDate(now: Date): string {
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${now.getFullYear()}`;
}

function pageFindingsTemplate(page: PageRun): PageFindings {
  return {
    ...(page.psi === undefined ? {} : { psi: OK_TEST_FINDING }),
    ...(page.js === undefined ? {} : { js: OK_JS_FINDING }),
    ...(page.gsc === undefined ? {} : { gsc: OK_TEST_FINDING })
  };
}

export function buildFindingsTemplate(manifest: Manifest, now: Date = new Date()): Findings {
  const pages: Record<string, PageFindings> = {};
  for (const page of manifest.pages) {
    pages[page.slug] = pageFindingsTemplate(page);
  }

  return { brand: manifest.site.brand, date: formatDate(now), pages };
}
