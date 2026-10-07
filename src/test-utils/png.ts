import { readFile } from 'node:fs/promises';

const PNG_SIGNATURE_LENGTH = 8;
const IHDR_CHUNK_HEADER_LENGTH = 8;

export interface PngSize {
  readonly width: number;
  readonly height: number;
}

export async function readPngSize(path: string): Promise<PngSize> {
  const buffer = await readFile(path);
  const ihdrOffset = PNG_SIGNATURE_LENGTH + IHDR_CHUNK_HEADER_LENGTH;

  return {
    width: buffer.readUInt32BE(ihdrOffset),
    height: buffer.readUInt32BE(ihdrOffset + 4)
  };
}
