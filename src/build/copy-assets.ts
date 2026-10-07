import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Manifest, PageRun } from '../manifest.js';
import { LOGO_FILES, packageAssetsDir } from './asset-paths.js';

function pageScreenshots(page: PageRun): readonly string[] {
  const paths: string[] = [];
  if (page.psi !== undefined) {
    paths.push(page.psi.screenshot);
  }
  if (page.js !== undefined) {
    paths.push(page.js.on, page.js.off);
    if (page.js.onAfterConsent !== undefined) {
      paths.push(page.js.onAfterConsent);
    }
  }
  if (page.gsc !== undefined) {
    paths.push(page.gsc.screenshot, page.gsc.resources);
  }
  return paths;
}

async function copyLogos(deckDir: string, brandLogo: string): Promise<void> {
  const destDir = join(deckDir, 'assets');
  await mkdir(destDir, { recursive: true });
  await copyFile(brandLogo, join(destDir, LOGO_FILES.brand));
  for (const file of [LOGO_FILES.psi, LOGO_FILES.chrome, LOGO_FILES.gsc]) {
    await copyFile(join(packageAssetsDir(), file), join(destDir, file));
  }
}

async function copyScreenshot(runDir: string, deckDir: string, relativePath: string): Promise<void> {
  const dest = join(deckDir, relativePath);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(runDir, relativePath), dest);
}

export async function copyDeckAssets(runDir: string, deckDir: string, manifest: Manifest, brandLogo: string): Promise<void> {
  await mkdir(deckDir, { recursive: true });
  await copyLogos(deckDir, brandLogo);

  for (const page of manifest.pages) {
    for (const relativePath of pageScreenshots(page)) {
      await copyScreenshot(runDir, deckDir, relativePath);
    }
  }
}
