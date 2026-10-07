import { readManifest, type PageRun } from '../manifest.js';

/* Re-running capture into an existing run directory (one page again, one test
   again) keeps every earlier result: pages are merged by slug, tests by name,
   and a fresh result clears that test's recorded error. */
export async function previousPages(runDir: string): Promise<readonly PageRun[]> {
  try {
    return (await readManifest(runDir)).pages;
  } catch {
    return [];
  }
}

export function mergeRuns(previous: readonly PageRun[], current: readonly PageRun[]): PageRun[] {
  const bySlug = new Map(previous.map((run) => [run.slug, run]));
  for (const run of current) {
    const old = bySlug.get(run.slug);
    if (old === undefined) {
      bySlug.set(run.slug, run);
      continue;
    }
    const errors: Record<string, string> = { ...(old.errors ?? {}), ...(run.errors ?? {}) };
    for (const test of ['psi', 'js', 'gsc'] as const) if (run[test] !== undefined) delete errors[test];
    const merged: PageRun = { ...old, ...run, ...(Object.keys(errors).length > 0 ? { errors } : {}) };
    if (Object.keys(errors).length === 0) delete (merged as { errors?: unknown }).errors;
    bySlug.set(run.slug, merged);
  }
  return [...bySlug.values()];
}
