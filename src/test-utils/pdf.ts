import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const PAGE_OBJECT_PATTERN = /\/Type\s*\/Page(?!s)/g;
const OBJECT_STREAM_PATTERN = /(\d+ \d+ obj[\s\S]*?stream\r?\n)([\s\S]*?)endstream/g;

function countPageObjects(text: string): number {
  const matches = text.match(PAGE_OBJECT_PATTERN);
  return matches === null ? 0 : matches.length;
}

/**
 * Modern PDF writers pack most objects (page dictionaries included) into
 * compressed `/ObjStm` object streams, so a plain-text scan for `/Type /Page`
 * usually finds nothing. This inflates every FlateDecode object stream and
 * counts page objects there too - a small, dependency-free PDF page counter.
 */
function countPagesInObjectStreams(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  let total = 0;

  for (const match of text.matchAll(OBJECT_STREAM_PATTERN)) {
    const header = match[1] ?? '';
    const body = match[2] ?? '';
    if (!/\/Type\s*\/ObjStm/.test(header) || !/\/Filter\s*\/FlateDecode/.test(header)) {
      continue;
    }
    const streamBytes = Buffer.from(body, 'latin1');
    const inflated = inflateSync(streamBytes).toString('latin1');
    total += countPageObjects(inflated);
  }

  return total;
}

/**
 * Counts `/Type /Page` objects in a PDF (excluding `/Type /Pages` tree
 * nodes), across both plain-text objects and compressed object streams.
 */
export async function countPdfPages(path: string): Promise<number> {
  const buffer = await readFile(path);
  return countPageObjects(buffer.toString('latin1')) + countPagesInObjectStreams(buffer);
}
