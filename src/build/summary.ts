import type { Findings, TestStatus } from '../findings.js';
import type { Manifest, PageRun } from '../manifest.js';
import { PSI_PASS_SCORE, psiStatus } from './slides.js';

/* The at-a-glance slide right after the overview: how many page types pass
   every captured test, then one line per test. Counts come from the manifest
   (what was captured) and findings.json (the review's ok / not-ok). */

type Test = 'psi' | 'js' | 'gsc';
const TEST_LABELS: Readonly<Record<Test, string>> = { psi: 'PSI mobile', js: 'JS turned off', gsc: 'GSC live test' };
const TESTS: readonly Test[] = ['psi', 'js', 'gsc'];

function status(page: PageRun, findings: Findings, test: Test): TestStatus | undefined {
  const finding = findings.pages[page.slug]?.[test];
  if (test === 'psi') return page.psi === undefined ? undefined : psiStatus(page.psi, finding);
  return page[test] === undefined ? undefined : finding?.status;
}

function psiLine(pages: readonly PageRun[], okCount: number): string {
  const scores = pages.flatMap((page) => (page.psi === undefined ? [] : [page.psi.score]));
  return `- **${TEST_LABELS.psi}:** ${okCount} of ${scores.length} ok, scores ${Math.min(...scores)} to ${Math.max(...scores)} (pass: ${PSI_PASS_SCORE}+)`;
}

function testLine(manifest: Manifest, findings: Findings, test: Test): string | undefined {
  const statuses = manifest.pages.map((page) => status(page, findings, test)).filter((s) => s !== undefined);
  if (statuses.length === 0) return undefined;
  const okCount = statuses.filter((s) => s === 'ok').length;
  if (test === 'psi') return psiLine(manifest.pages, okCount);
  return `- **${TEST_LABELS[test]}:** ${okCount} of ${statuses.length} ok`;
}

function headline(manifest: Manifest, findings: Findings, tests: readonly Test[]): string {
  const passing = manifest.pages.filter((page) => tests.every((test) => status(page, findings, test) !== 'not-ok')).length;
  const what = tests.length === TESTS.length ? 'all 3 SEO tests' : tests.map((test) => TEST_LABELS[test]).join(' and ');
  return `# ${passing} of ${manifest.pages.length} page types pass ${what}`;
}

export function buildSummarySlide(manifest: Manifest, findings: Findings): string {
  const captured = TESTS.filter((test) => manifest.pages.some((page) => page[test] !== undefined));
  const lines = captured.map((test) => testLine(manifest, findings, test)).filter((line) => line !== undefined);
  return ['<!-- _class: title-bullets-left -->', headline(manifest, findings, captured), lines.join('\n')].join('\n\n');
}
