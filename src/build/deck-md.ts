import type { Findings, PageFindings } from '../findings.js';
import type { Manifest, PageRun } from '../manifest.js';
import { LOGO_FILES } from './asset-paths.js';
import { buildSummarySlide } from './summary.js';
import { buildGscSlide, buildJsSlide, buildPsiSlide, buildSectionSlide } from './slides.js';

const OVERVIEW_BULLETS = [
  '- **Page Speed Insights: minimum score of 80 (still orange) / preferably 90 ([green]{#1db100}) + sensemaking screenshots** for mobile!',
  '- **"JS turned off"** Test:',
  '  - **Above fold and main content must be visible** on the site with JS turned off!',
  '  - **Interlinking must work** with JS turned off! (Visible links must be links.)',
  '- Google Search Console -> **Inspect URL -> Test Live URL -> View Tested Page -> Screenshot must show rendered page!** (Images below fold (non-visible) might get lazy loaded)'
].join('\n');

export interface DeckOptions {
  /** Deck author, printed in the title slide footer. */
  readonly author: string;
}

function buildFrontMatter(brand: string, author: string): string {
  return ['---', `title: 3 SEO Tests - ${brand}`, `author: ${author}`, `logo: assets/${LOGO_FILES.brand}`, '---'].join('\n');
}

function buildTitleSlide(findings: Findings, origin: string, author: string): string {
  return [
    '<!-- _class: title-left -->',
    '# 3 SEO Tests',
    `## [${findings.brand}](${origin})`,
    `Footer: ${author} / ${findings.date}`
  ].join('\n\n');
}

function buildOverviewSlide(): string {
  return [
    '<!-- _class: title-bullets-left -->',
    '# 3 SEO Tests to do 80% of technical onpage/onsite SEO right!',
    OVERVIEW_BULLETS
  ].join('\n\n');
}

function requireFinding<T>(value: T | undefined, slug: string, test: string): T {
  if (value === undefined) {
    throw new Error(`Page "${slug}" has a ${test} capture but no ${test} finding in findings.json`);
  }
  return value;
}

function findPageFindings(findings: Findings, slug: string): PageFindings {
  const pageFindings = findings.pages[slug];
  if (pageFindings === undefined) {
    throw new Error(`findings.json is missing an entry for page slug "${slug}"`);
  }
  return pageFindings;
}

function buildPageSlides(page: PageRun, findings: Findings): readonly string[] {
  const pageFindings = findPageFindings(findings, page.slug);
  const slides: string[] = [buildSectionSlide(page)];

  if (page.psi !== undefined) {
    slides.push(buildPsiSlide(page, page.psi, pageFindings.psi));
  }
  if (page.js !== undefined) {
    const jsFinding = requireFinding(pageFindings.js, page.slug, 'js');
    slides.push(buildJsSlide(page, page.js, jsFinding));
  }
  if (page.gsc !== undefined) {
    const gscFinding = requireFinding(pageFindings.gsc, page.slug, 'gsc');
    slides.push(buildGscSlide(page, page.gsc, gscFinding));
  }

  return slides;
}

export function buildDeckMarkdown(manifest: Manifest, findings: Findings, options: DeckOptions): string {
  const slides: string[] = [
    buildTitleSlide(findings, manifest.site.origin, options.author),
    buildOverviewSlide(),
    buildSummarySlide(manifest, findings)
  ];

  for (const page of manifest.pages) {
    slides.push(...buildPageSlides(page, findings));
  }

  return `${buildFrontMatter(findings.brand, options.author)}\n\n${slides.join('\n\n---\n\n')}\n`;
}
