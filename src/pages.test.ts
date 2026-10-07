import { describe, expect, it } from 'vitest';
import { parsePages } from './pages.js';

const FIXTURE = `
# comment line, ignored
Start Page: https://www.example.com/

Detail Page - Video: https://www.example.com/videos/some-clip:extra

List Page: http://example.com/list
`;

describe('parsePages', () => {
  it('parses page type and url, splitting on the first ": "', () => {
    const pages = parsePages(FIXTURE);

    expect(pages).toHaveLength(3);
    expect(pages[0]).toEqual({
      type: 'Start Page',
      url: 'https://www.example.com/',
      slug: 'start-page'
    });
    expect(pages[1]).toEqual({
      type: 'Detail Page - Video',
      url: 'https://www.example.com/videos/some-clip:extra',
      slug: 'detail-page-video'
    });
    expect(pages[2]?.type).toBe('List Page');
  });

  it('throws on an empty file', () => {
    expect(() => parsePages('\n\n# just a comment\n')).toThrow(/no page lines/);
  });

  it('throws on a line without ": "', () => {
    expect(() => parsePages('NoSeparatorHere')).toThrow(/does not match/);
  });

  it('throws on a non-http(s) url', () => {
    expect(() => parsePages('Start Page: ftp://example.com/')).toThrow(/non-http/);
  });

  it('throws on an invalid url', () => {
    expect(() => parsePages('Start Page: not a url')).toThrow(/valid URL/);
  });
});
