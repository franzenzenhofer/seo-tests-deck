import { describe, expect, it } from 'vitest';
import type { TestFinding } from '../findings.js';
import type { GscResult } from '../manifest.js';
import { applyResourceRule, shortUrl } from './gsc-rule.js';
import { buildGscSlide } from './slides.js';

const OTHER = 'Other error';
const ROBOTS = 'Googlebot blocked by robots.txt';

const gsc = (failedResources: GscResult['failedResources']): GscResult => ({
  screenshot: 'shots/p-gsc.png',
  resources: 'shots/p-gsc-resources.png',
  inspectUrl: 'https://search.google.com/x',
  verdict: 'URL is available to Google',
  resourcesStatus: "4/105 couldn't be loaded",
  ...(failedResources === undefined ? {} : { failedResources })
});

const withOtherErrors = gsc([
  { reason: OTHER, type: 'Image', url: 'https://pictures.immobilienscout24.de/listings/a-very-long-path-name/picture-123456.png' },
  { reason: OTHER, type: 'XHR', url: 'https://sso.immobilienscout24.de/sso/me' },
  { reason: ROBOTS, type: 'Script', url: 'https://tracking.immobilienscout24.de/tr.js?x=1' }
]);
const onlyRobots = gsc([{ reason: ROBOTS, type: 'Script', url: 'https://tracking.immobilienscout24.de/tr.js' }]);
const ok: TestFinding = { status: 'ok', is: ['renders main content'], should: [] };
const page = { type: 'Start page', url: 'https://www.immobilienscout24.de/', slug: 'start-page' };

describe('applyResourceRule', () => {
  it('turns an ok render with Other error resources orange with SHOULD lines', () => {
    const result = applyResourceRule(withOtherErrors, ok);
    expect(result.status).toBe('warn');
    expect(result.is).toEqual(ok.is);
    expect(result.should[0]).toBe("all page resources load - 2 of 105 couldn't be loaded with 'Other error'");
    expect(result.should).toHaveLength(3);
    expect(result.should[1]).toMatch(/^Image pictures\.immobilienscout24\.de\/listings\/.*\.\.\.$/);
    expect(result.should[2]).toBe('XHR sso.immobilienscout24.de/sso/me');
  });

  it('stays green when only robots.txt blocks, or nothing was read', () => {
    expect(applyResourceRule(onlyRobots, ok)).toEqual(ok);
    expect(applyResourceRule(gsc(undefined), ok)).toEqual(ok);
  });

  it('stays red when the render is broken', () => {
    const broken: TestFinding = { status: 'not-ok', is: ['cookie banner only'], should: [] };
    expect(applyResourceRule(withOtherErrors, broken)).toEqual(broken);
  });
});

describe('buildGscSlide borders', () => {
  it('uses orange, green and red', () => {
    expect(buildGscSlide(page, withOtherErrors, ok)).toContain('![border=#ff9300](shots/p-gsc.png)');
    expect(buildGscSlide(page, onlyRobots, ok)).toContain('![border=green](shots/p-gsc.png)');
    expect(buildGscSlide(page, withOtherErrors, { ...ok, status: 'not-ok' })).toContain('![border=red](shots/p-gsc.png)');
  });
});

describe('shortUrl', () => {
  it('drops protocol and query', () => {
    expect(shortUrl('https://tracking.immobilienscout24.de/tr.js?x=1')).toBe('tracking.immobilienscout24.de/tr.js');
  });
});
