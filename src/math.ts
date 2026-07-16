import type { MathRegion } from "./types";
import {
  editableRanges,
  findNonMathProtectedRanges,
  type TextRange,
} from "./markdownProtection";

export const MAX_DOC_LENGTH = 100_000;

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function isExactDollarRun(text: string, index: number, length: 1 | 2): boolean {
  if (text.slice(index, index + length) !== "$".repeat(length)) return false;
  return text[index - 1] !== "$" && text[index + length] !== "$";
}

function isInlineOpen(text: string, index: number, to: number): boolean {
  if (!isExactDollarRun(text, index, 1) || isEscaped(text, index)) return false;
  const next = text[index + 1];
  return index + 1 < to && next !== undefined && !/\s/.test(next);
}

function isInlineClose(text: string, index: number): boolean {
  if (!isExactDollarRun(text, index, 1) || isEscaped(text, index)) return false;
  const previous = text[index - 1];
  return previous !== undefined && !/\s/.test(previous);
}

function findDisplayClose(text: string, from: number, to: number): number {
  let cursor = from;
  while ((cursor = text.indexOf("$$", cursor)) >= 0 && cursor + 2 <= to) {
    if (isExactDollarRun(text, cursor, 2) && !isEscaped(text, cursor)) return cursor;
    cursor += 2;
  }
  return -1;
}

function findInlineClose(text: string, from: number, to: number): number {
  for (let cursor = from; cursor < to; cursor += 1) {
    if (text[cursor] === "\n" || text[cursor] === "\r") return -1;
    if (text[cursor] === "$" && isInlineClose(text, cursor)) return cursor;
  }
  return -1;
}

interface MathChunkScan {
  regions: MathRegion[];
  hasUnclosedDisplay: boolean;
}

interface MarkdownMathIndex extends MathChunkScan {
  protectedRanges: TextRange[];
}

let cachedMathIndex: { text: string; index: MarkdownMathIndex } | null = null;

function scanMathChunk(text: string, from: number, to: number): MathChunkScan {
  const regions: MathRegion[] = [];
  let hasUnclosedDisplay = false;
  let cursor = from;

  while (cursor < to) {
    if (
      cursor + 2 <= to &&
      isExactDollarRun(text, cursor, 2) &&
      !isEscaped(text, cursor)
    ) {
      const close = findDisplayClose(text, cursor + 2, to);
      if (close >= 0) {
        regions.push({ from: cursor, to: close + 2, kind: "display" });
        cursor = close + 2;
        continue;
      }
      hasUnclosedDisplay = true;
      cursor += 2;
      continue;
    }

    if (text[cursor] === "$" && isInlineOpen(text, cursor, to)) {
      const close = findInlineClose(text, cursor + 1, to);
      if (close >= 0) {
        regions.push({ from: cursor, to: close + 1, kind: "inline" });
        cursor = close + 1;
        continue;
      }
    }
    cursor += 1;
  }

  return { regions, hasUnclosedDisplay };
}

function buildMarkdownMathIndex(
  text: string,
  protectedRanges: TextRange[],
): MarkdownMathIndex {
  const regions: MathRegion[] = [];
  let hasUnclosedDisplay = false;

  for (const range of editableRanges(text.length, protectedRanges)) {
    const chunk = scanMathChunk(text, range.from, range.to);
    regions.push(...chunk.regions);
    hasUnclosedDisplay ||= chunk.hasUnclosedDisplay;
  }

  return { regions, protectedRanges, hasUnclosedDisplay };
}

function getMarkdownMathIndex(text: string): MarkdownMathIndex {
  if (cachedMathIndex?.text === text) return cachedMathIndex.index;
  const protectedRanges = findNonMathProtectedRanges(text);
  const index = buildMarkdownMathIndex(text, protectedRanges);
  cachedMathIndex = { text, index };
  return index;
}

/** All matched Markdown math regions outside Markdown code/frontmatter regions. */
export function scanMarkdownMathRegions(
  text: string,
  protectedRanges?: TextRange[],
): MathRegion[] {
  const index = protectedRanges
    ? buildMarkdownMathIndex(text, protectedRanges)
    : getMarkdownMathIndex(text);
  return [...index.regions];
}

export function findMathRegionAt(text: string, offset: number): MathRegion | null {
  if (text.length > MAX_DOC_LENGTH) return null;
  return findMathRegionAtForEdit(text, offset);
}

/** Full scan for explicit user actions where a false "outside math" result could corrupt text. */
export function findMathRegionAtForEdit(text: string, offset: number): MathRegion | null {
  if (offset < 0 || offset > text.length) return null;
  return (
    getMarkdownMathIndex(text).regions.find(
      (region) => {
        const bounds = getMathContentBounds(region);
        return offset >= bounds.from && offset <= bounds.to;
      },
    ) ?? null
  );
}

export function isInMath(text: string, offset: number): boolean {
  return findMathRegionAt(text, offset) !== null;
}

/** True when a valid inline opener before offset has no same-line close. */
export function hasUnclosedInlineMathBefore(text: string, offset: number): boolean {
  if (offset <= 0) return false;
  const end = Math.min(offset, text.length);
  const protectedRanges = getMarkdownMathIndex(text).protectedRanges;

  for (const chunk of editableRanges(text.length, protectedRanges, 0, end)) {
    let cursor = chunk.from;
    while (cursor < chunk.to) {
      if (
        cursor + 2 <= chunk.to &&
        isExactDollarRun(text, cursor, 2) &&
        !isEscaped(text, cursor)
      ) {
        const close = findDisplayClose(text, cursor + 2, chunk.to);
        cursor = close >= 0 ? close + 2 : chunk.to;
        continue;
      }
      if (text[cursor] === "$" && isInlineOpen(text, cursor, chunk.to)) {
        const close = findInlineClose(text, cursor + 1, chunk.to);
        if (close < 0) return true;
        cursor = close + 1;
        continue;
      }
      cursor += 1;
    }
  }
  return false;
}

function touchesInlineMathClose(text: string, offset: number): boolean {
  if (offset <= 0 || offset > text.length) return false;
  return getMarkdownMathIndex(text).regions.some(
    (region) =>
      region.kind === "inline" && (region.to === offset || region.to === offset - 1),
  );
}

/** Whether `wrapOutsideMath` should add `$…$` around a snippet at `[from, to]`. */
export function shouldAutoWrapSnippet(text: string, from: number, to: number): boolean {
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(text.length, Math.max(from, to));
  if (
    getMarkdownMathIndex(text).regions.some(
      (region) => start <= region.to && end >= region.from,
    )
  ) {
    return false;
  }

  if (hasUnclosedInlineMathBefore(text, from)) return false;
  if (from === to && touchesInlineMathClose(text, from)) return false;
  return true;
}

/** Move an empty cursor from just after `$…$` to before the closing `$`. */
export function resolveSnippetInsertPosition(
  text: string,
  from: number,
  to: number,
): { from: number; to: number } {
  if (from !== to) return { from, to };
  const region = getMarkdownMathIndex(text).regions.find(
    (entry) =>
      entry.kind === "inline" && (entry.to === from || entry.to === from - 1),
  );
  if (region) return { from: region.to - 1, to: region.to - 1 };
  return { from, to };
}

export function getMathContentBounds(region: MathRegion): { from: number; to: number } {
  if (region.kind === "display") {
    return { from: region.from + 2, to: region.to - 2 };
  }
  return { from: region.from + 1, to: region.to - 1 };
}

export function extractMathContent(text: string, region: MathRegion): string {
  const { from, to } = getMathContentBounds(region);
  return text.slice(from, to);
}

export function isValidMathRegion(text: string, region: MathRegion): boolean {
  if (region.from < 0 || region.to > text.length || region.from >= region.to) return false;
  return getMarkdownMathIndex(text).regions.some(
    (candidate) =>
      candidate.from === region.from &&
      candidate.to === region.to &&
      candidate.kind === region.kind,
  );
}

/** True when normal Markdown text contains an opening `$$` without a close. */
export function hasUnclosedDisplayMath(text: string): boolean {
  return getMarkdownMathIndex(text).hasUnclosedDisplay;
}
