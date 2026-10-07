import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* File names inside the deck's assets/ directory. The brand logo is copied
   there under one fixed name, whatever file it came from. */
export const LOGO_FILES = {
  brand: 'brand-logo.png',
  psi: 'psi-logo.jpg',
  chrome: 'chrome-logo.png',
  gsc: 'gsc-logo.png'
} as const;

export const DEFAULT_AUTHOR = 'f19n';
const DEFAULT_BRAND_LOGO = 'f19n-logo.png';

/**
 * Resolves the package's bundled `assets/` directory relative to this file -
 * works from `src/build` (vitest) and `dist/build` (compiled) alike.
 */
export function packageAssetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'assets');
}

export function defaultBrandLogo(): string {
  return join(packageAssetsDir(), DEFAULT_BRAND_LOGO);
}
