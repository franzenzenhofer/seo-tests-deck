export interface PageSpec {
  readonly type: string;
  readonly url: string;
  readonly slug: string;
}

const COMMENT_PREFIX = '#';
const SEPARATOR = ': ';

function toSlug(type: string): string {
  const slug = type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) {
    throw new Error(`Page type "${type}" produces an empty slug`);
  }

  return slug;
}

function assertHttpUrl(url: string, line: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Line "${line}" does not contain a valid URL: "${url}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Line "${line}" has a non-http(s) URL: "${url}"`);
  }
}

function parseLine(line: string): PageSpec {
  const separatorIndex = line.indexOf(SEPARATOR);

  if (separatorIndex === -1) {
    throw new Error(`Line does not match "Page Type: URL" format: "${line}"`);
  }

  const type = line.slice(0, separatorIndex).trim();
  const url = line.slice(separatorIndex + SEPARATOR.length).trim();

  if (type.length === 0) {
    throw new Error(`Line has an empty page type: "${line}"`);
  }

  assertHttpUrl(url, line);

  return { type, url, slug: toSlug(type) };
}

export function parsePages(fileContents: string): readonly PageSpec[] {
  const lines = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(COMMENT_PREFIX));

  if (lines.length === 0) {
    throw new Error('Batch file contains no page lines');
  }

  return lines.map(parseLine);
}
