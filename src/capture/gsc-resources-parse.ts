/* Pure parser for the Search Console "Page resources" panel (URL Inspection ->
   Test live URL -> View tested page -> More info). Every failed resource is a
   reason line, a type and a URL; the parser works on the panel's innerText. */

export interface FailedResource {
  readonly reason: string;
  readonly type: string;
  readonly url: string;
}

const URL_PATTERN = /https?:\/\/\S+/g;
const KNOWN_REASON_AND_TYPE = /(Other error|Googlebot blocked by robots\.txt)\s+(\S+)\s*$/;

function reasonAndType(segment: string): { reason: string; type: string } | undefined {
  const known = KNOWN_REASON_AND_TYPE.exec(segment.replace(/\s+/g, ' ').trim());
  if (known?.[1] !== undefined && known[2] !== undefined) return { reason: known[1], type: known[2] };
  const parts = segment
    .split(/\t|\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const type = parts[parts.length - 1];
  const reason = parts[parts.length - 2];
  if (type === undefined || reason === undefined) return undefined;
  return { reason, type };
}

export function parseFailedResources(panelText: string): readonly FailedResource[] {
  const found: FailedResource[] = [];
  let segmentStart = 0;
  for (const match of panelText.matchAll(URL_PATTERN)) {
    const parsed = reasonAndType(panelText.slice(segmentStart, match.index));
    segmentStart = match.index + match[0].length;
    if (parsed === undefined) continue;
    found.push({ ...parsed, url: match[0] });
  }
  return found;
}

/** Merges several reads of a scrolling panel, first occurrence wins, order kept. */
export function mergeFailedResources(reads: readonly (readonly FailedResource[])[]): readonly FailedResource[] {
  const seen = new Set<string>();
  const merged: FailedResource[] = [];
  for (const resource of reads.flat()) {
    const key = `${resource.reason}|${resource.type}|${resource.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(resource);
  }
  return merged;
}
