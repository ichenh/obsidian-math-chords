import { scanMarkdownMathRegions } from "./math";
import {
  editableRanges,
  findNonMathProtectedRanges,
  mergeRanges,
} from "./markdownProtection";

export interface DelimiterConversion {
  changes: DelimiterChange[];
  displayCount: number;
  inlineCount: number;
}

export interface DelimiterChange {
  from: number;
  to: number;
  text: "$" | "$$";
}

export interface ConversionRange {
  from: number;
  to: number;
}

/**
 * Finds LaTeX math delimiter pairs in editable Markdown text.
 * Bounds apply to complete pairs, while protection is parsed from the full document.
 */
export function findLatexDelimiterConversions(
  markdown: string,
  from = 0,
  to = markdown.length,
): DelimiterConversion {
  const nonMathProtectedRanges = findNonMathProtectedRanges(markdown);
  const protectedRanges = mergeRanges([
    ...nonMathProtectedRanges,
    ...scanMarkdownMathRegions(markdown, nonMathProtectedRanges),
  ]);
  const changes: DelimiterChange[] = [];
  let displayCount = 0;
  let inlineCount = 0;

  for (const range of editableRanges(markdown.length, protectedRanges, from, to)) {
    const counts = findConversionsInText(markdown, range.from, range.to, changes);
    displayCount += counts.displayCount;
    inlineCount += counts.inlineCount;
  }

  changes.sort((a, b) => a.from - b.from);
  return { changes, displayCount, inlineCount };
}

/** Finds conversions independently in every non-empty editor selection. */
export function findLatexDelimiterConversionsInRanges(
  markdown: string,
  ranges: ConversionRange[],
): DelimiterConversion {
  const byPosition = new Map<string, DelimiterChange>();

  for (const range of ranges) {
    if (range.from === range.to) continue;
    const conversion = findLatexDelimiterConversions(
      markdown,
      Math.min(range.from, range.to),
      Math.max(range.from, range.to),
    );
    for (const change of conversion.changes) {
      byPosition.set(`${change.from}:${change.to}`, change);
    }
  }

  const changes = [...byPosition.values()].sort((a, b) => a.from - b.from);
  const displayCount = changes.filter((change) => change.text === "$$").length / 2;
  const inlineCount = changes.filter((change) => change.text === "$").length / 2;

  return {
    changes,
    displayCount,
    inlineCount,
  };
}

/** Converts clipboard text using the Markdown context at one replacement range. */
export function convertPastedLatexDelimiters(
  markdown: string,
  pastedText: string,
  from: number,
  to: number,
): string | null {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const prospective = markdown.slice(0, start) + pastedText + markdown.slice(end);
  const conversion = findLatexDelimiterConversions(
    prospective,
    start,
    start + pastedText.length,
  );
  if (conversion.changes.length === 0) return null;
  return applyDelimiterChanges(
    pastedText,
    conversion.changes.map((change) => ({
      ...change,
      from: change.from - start,
      to: change.to - start,
    })),
  );
}

export function applyDelimiterChanges(text: string, changes: DelimiterChange[]): string {
  if (changes.length === 0) return text;
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  const parts: string[] = [];
  let cursor = 0;
  for (const change of sorted) {
    parts.push(text.slice(cursor, change.from), change.text);
    cursor = change.to;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

function findConversionsInText(
  text: string,
  from: number,
  to: number,
  changes: DelimiterChange[],
): { displayCount: number; inlineCount: number } {
  let displayCount = 0;
  let inlineCount = 0;

  for (const [open, close, replacement, kind] of [
    ["\\[", "\\]", "$$", "display"],
    ["\\(", "\\)", "$", "inline"],
  ] as const) {
    let cursor = from;
    while (cursor < to) {
      const openAt = findUnescapedToken(text, open, cursor, to);
      if (openAt < 0) break;
      const closeAt = findUnescapedToken(text, close, openAt + open.length, to);
      if (closeAt < 0) break;

      if (kind === "inline" && /[\r\n]/.test(text.slice(openAt + open.length, closeAt))) {
        cursor = openAt + open.length;
        continue;
      }

      changes.push(
        { from: openAt, to: openAt + open.length, text: replacement },
        { from: closeAt, to: closeAt + close.length, text: replacement },
      );
      if (kind === "display") displayCount += 1;
      else inlineCount += 1;
      cursor = closeAt + close.length;
    }
  }

  return { displayCount, inlineCount };
}

function findUnescapedToken(text: string, token: string, from: number, to: number): number {
  let position = from;
  while ((position = text.indexOf(token, position)) >= 0 && position + token.length <= to) {
    if (!isEscaped(text, position)) return position;
    position += token.length;
  }
  return -1;
}

function isEscaped(text: string, position: number): boolean {
  let slashCount = 0;
  for (let index = position - 1; index >= 0 && text[index] === "\\"; index -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}
