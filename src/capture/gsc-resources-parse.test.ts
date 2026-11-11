import { describe, expect, it } from 'vitest';
import { mergeFailedResources, parseFailedResources } from './gsc-resources-parse.js';

const PANEL_TEXT = [
  'Page resources',
  "4/105 couldn't be loaded",
  'Other error\tImage\thttps://pictures.immobilienscout24.de/listings/abc.png',
  'Other error\tXHR\thttps://sso.immobilienscout24.de/sso/me',
  'Googlebot blocked by robots.txt\tScript\thttps://tracking.immobilienscout24.de/tr.js?x=1',
  'Googlebot blocked by robots.txt\tScript\thttps://web.chatbot.immobilienscout24.de/widget/is24-chatbot-widget.js'
].join('\n');

describe('parseFailedResources', () => {
  it('reads reason, type and url of every failed resource', () => {
    expect(parseFailedResources(PANEL_TEXT)).toEqual([
      { reason: 'Other error', type: 'Image', url: 'https://pictures.immobilienscout24.de/listings/abc.png' },
      { reason: 'Other error', type: 'XHR', url: 'https://sso.immobilienscout24.de/sso/me' },
      { reason: 'Googlebot blocked by robots.txt', type: 'Script', url: 'https://tracking.immobilienscout24.de/tr.js?x=1' },
      {
        reason: 'Googlebot blocked by robots.txt',
        type: 'Script',
        url: 'https://web.chatbot.immobilienscout24.de/widget/is24-chatbot-widget.js'
      }
    ]);
  });

  it('reads the same list when everything is on one line', () => {
    const flat = PANEL_TEXT.replace(/\n|\t/g, ' ');
    expect(parseFailedResources(flat)).toHaveLength(4);
    expect(parseFailedResources(flat)[1]).toMatchObject({ reason: 'Other error', type: 'XHR' });
  });

  it('returns nothing for a panel without failures', () => {
    expect(parseFailedResources('Page resources\nAll page resources could be loaded')).toEqual([]);
  });
});

describe('mergeFailedResources', () => {
  it('drops duplicates across scroll reads and keeps order', () => {
    const first = parseFailedResources(PANEL_TEXT).slice(0, 2);
    const second = parseFailedResources(PANEL_TEXT).slice(1);
    expect(mergeFailedResources([first, second])).toHaveLength(4);
  });
});
