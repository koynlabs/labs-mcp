import { POST_MAX_WEIGHTED } from "./constants";

/**
 * twitter-text v3 weights. Code points in the listed ranges count as 1.
 * Everything else (most emoji, CJK) counts as 2. A URL counts as 23, which is
 * the t.co length, not the raw string length.
 */
const SINGLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

const URL_RE = /https?:\/\/[^\s]+/gi;

function weightOf(codePoint: number): number {
  for (const [start, end] of SINGLE_RANGES) {
    if (codePoint >= start && codePoint <= end) return 1;
  }
  return 2;
}

function weightText(text: string): number {
  let total = 0;
  for (const char of text) {
    const point = char.codePointAt(0);
    if (point !== undefined) total += weightOf(point);
  }
  return total;
}

export function weightedLength(text: string): number {
  let total = 0;
  let cursor = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const trimmed = raw.replace(/[.,!?:;)\]]+$/g, "");
    total += weightText(text.slice(cursor, index));
    total += 23;
    total += weightText(raw.slice(trimmed.length));
    cursor = index + raw.length;
  }
  total += weightText(text.slice(cursor));
  return total;
}

export function assertPostLength(text: string): number {
  const length = weightedLength(text);
  if (length > POST_MAX_WEIGHTED) {
    throw new Error(
      `Post is ${length} weighted characters. The limit is ${POST_MAX_WEIGHTED}. A URL counts as 23.`,
    );
  }
  return length;
}
