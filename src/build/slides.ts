import type { JsFinding, TestFinding, TestStatus } from '../findings.js';
import type { GscResult, JsResult, PageRun, PsiResult } from '../manifest.js';
import { LOGO_FILES } from './asset-paths.js';
import { renderNotesBlock } from './notes.js';

const JS_DEFAULT_OK_TEXT = 'no JS rendering dependencies';
const GSC_DEFAULT_OK_TEXT = 'rendered page shows the main content';

type Border = 'red' | 'green';

function scopeLine(page: PageRun): string {
  return `Scope: ${page.type} ([${page.url}](${page.url}))`;
}

export function buildSectionSlide(page: PageRun): string {
  return [
    '<!-- _class: section-left -->',
    `# ${page.type}`,
    `## [${page.url}](${page.url})`
  ].join('\n\n');
}

function statusBorder(status: TestStatus): Border {
  return status === 'not-ok' ? 'red' : 'green';
}

/** PSI passes at a mobile score of 80 or more, unless the review overrides it. */
export const PSI_PASS_SCORE = 80;

export function psiStatus(psi: PsiResult, finding: TestFinding | undefined): TestStatus {
  if (finding !== undefined) return finding.status;
  return psi.score < PSI_PASS_SCORE ? 'not-ok' : 'ok';
}

export function buildPsiSlide(page: PageRun, psi: PsiResult, finding: TestFinding | undefined): string {
  const border = statusBorder(psiStatus(psi, finding));
  return [
    '<!-- _class: scope-shot -->',
    scopeLine(page),
    `Tool: assets/${LOGO_FILES.psi}`,
    '# Google Page Speed Insights',
    `![border=${border}](${psi.screenshot})`,
    `Caption: [${psi.analysisUrl}](${psi.analysisUrl})`
  ].join('\n\n');
}

function jsImageLines(js: JsResult, finding: JsFinding): string {
  const lines = [imageLine(js.on, 'on', 'JS on', finding)];
  if (js.onAfterConsent !== undefined) {
    lines.push(imageLine(js.onAfterConsent, 'onAfterConsent', 'JS on', finding));
  }
  lines.push(imageLine(js.off, 'off', 'JS off', finding));
  return lines.join('\n');
}

function imageLine(
  path: string,
  shotKey: 'on' | 'onAfterConsent' | 'off',
  label: string,
  finding: JsFinding
): string {
  const border = finding.highlight.includes(shotKey) ? ' border=red' : '';
  return `![label="${label}"${border}](${path})`;
}

export function buildJsSlide(page: PageRun, js: JsResult, finding: JsFinding): string {
  return [
    '<!-- _class: scope-compare -->',
    scopeLine(page),
    `Tool: assets/${LOGO_FILES.chrome}`,
    '# "JS turned off" Test',
    jsImageLines(js, finding),
    renderNotesBlock(finding, JS_DEFAULT_OK_TEXT)
  ].join('\n\n');
}

export function buildGscSlide(page: PageRun, gsc: GscResult, finding: TestFinding): string {
  return [
    '<!-- _class: scope-shot-notes -->',
    scopeLine(page),
    `Tool: assets/${LOGO_FILES.gsc}`,
    '# GSC Inspect URL',
    [`![border=${statusBorder(finding.status)}](${gsc.screenshot})`, `![border=green](${gsc.resources})`].join(
      '\n'
    ),
    renderNotesBlock(finding, GSC_DEFAULT_OK_TEXT),
    `Caption: [${gsc.inspectUrl}](${gsc.inspectUrl})`
  ].join('\n\n');
}
