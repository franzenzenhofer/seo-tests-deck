import type { TestFinding } from '../findings.js';
import type { GscResult } from '../manifest.js';

/* GSC "Page resources" rule: "Googlebot blocked by robots.txt" is fine, any
   "Other error" is never ok. A fine render with an "Other error" resource is
   the third state "warn" (orange); a broken render stays "not-ok" (red). */

export const OTHER_ERROR = 'Other error';
const MAX_SHORT_URL = 50;

const TOTAL_PATTERN = /\d+\s*\/\s*(\d+)/;

export function otherErrorResources(gsc: GscResult): GscResult['failedResources'] {
  return (gsc.failedResources ?? []).filter((resource) => resource.reason === OTHER_ERROR);
}

export function shortUrl(url: string): string {
  const parsed = new URL(url);
  const short = `${parsed.host}${parsed.pathname}`;
  return short.length > MAX_SHORT_URL ? `${short.slice(0, MAX_SHORT_URL - 3)}...` : short;
}

function totalResources(gsc: GscResult): string {
  const total = TOTAL_PATTERN.exec(gsc.resourcesStatus)?.[1];
  return total ?? String(gsc.failedResources?.length ?? 0);
}

/** Applies the rule to the review's finding: status plus the generated SHOULD lines. */
export function applyResourceRule(gsc: GscResult, finding: TestFinding): TestFinding {
  const failed = otherErrorResources(gsc) ?? [];
  if (failed.length === 0 || finding.status === 'not-ok') return finding;
  const lines = failed.map((resource) => `${resource.type} ${shortUrl(resource.url)}`);
  const head = `all page resources load - ${failed.length} of ${totalResources(gsc)} couldn't be loaded with '${OTHER_ERROR}'`;
  return { ...finding, status: 'warn', should: [...finding.should, head, ...lines] };
}
