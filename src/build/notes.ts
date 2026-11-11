import type { TestFinding } from '../findings.js';

/**
 * Renders the shared IS/SHOULD bullet block used by the JS and GSC test slides.
 * When `is` is empty and status is "ok" the single default bullet is used -
 * `findings.ts` already throws if `is` is empty while status is "not-ok".
 */
export function renderNotesBlock(finding: TestFinding, defaultOkText: string): string {
  const heading = { ok: 'IS (ok)', warn: 'IS (warning)', 'not-ok': 'IS (not ok)' }[finding.status];
  const isItems = finding.is.length > 0 ? finding.is : [defaultOkText];

  const lines = [`- **${heading}**`, ...isItems.map((item) => `- ${item}`)];

  if (finding.should.length > 0) {
    lines.push('- **SHOULD**', ...finding.should.map((item) => `- ${item}`));
  }

  return lines.join('\n');
}
