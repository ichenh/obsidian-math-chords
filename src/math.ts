import type { MathRegion } from "./types";

export const MAX_DOC_LENGTH = 100_000;

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function findDisplayRegion(text: string, offset: number): MathRegion | null {
  const pairs: Array<{ open: number; close: number }> = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "$" && text[i + 1] === "$" && !isEscaped(text, i)) {
      const open = i;
      i += 2;
      while (i < text.length - 1) {
        if (text[i] === "$" && text[i + 1] === "$" && !isEscaped(text, i)) {
          pairs.push({ open, close: i + 2 });
          i += 1;
          break;
        }
        i++;
      }
    }
  }

  for (const pair of pairs) {
    if (offset >= pair.open && offset <= pair.close) {
      return { from: pair.open, to: pair.close, kind: "display" };
    }
  }
  return null;
}

function findInlineRegion(text: string, offset: number): MathRegion | null {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$" || isEscaped(text, i)) continue;
    if (i < text.length - 1 && text[i + 1] === "$") {
      i++;
      continue;
    }

    const open = i;
    i++;
    while (i < text.length) {
      if (text[i] === "$" && !isEscaped(text, i)) {
        if (i < text.length - 1 && text[i + 1] === "$") break;
        const close = i + 1;
        if (offset >= open && offset <= close) {
          return { from: open, to: close, kind: "inline" };
        }
        break;
      }
      i++;
    }
  }
  return null;
}

export function findMathRegionAt(text: string, offset: number): MathRegion | null {
  if (text.length > MAX_DOC_LENGTH) return null;
  if (offset < 0 || offset > text.length) return null;

  return findDisplayRegion(text, offset) ?? findInlineRegion(text, offset);
}

export function isInMath(text: string, offset: number): boolean {
  return findMathRegionAt(text, offset) !== null;
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

  if (region.kind === "display") {
    return (
      text.slice(region.from, region.from + 2) === "$$" &&
      text.slice(region.to - 2, region.to) === "$$"
    );
  }

  if (text[region.from] !== "$" || text[region.to - 1] !== "$") return false;
  if (region.from > 0 && text[region.from - 1] === "$") return false;
  if (region.to < text.length && text[region.to] === "$") return false;
  return true;
}

/** True when the document contains an opening `$$` without a matching close. */
export function hasUnclosedDisplayMath(text: string): boolean {
  let open = false;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "$" && text[i + 1] === "$" && !isEscaped(text, i)) {
      open = !open;
      i++;
    }
  }
  return open;
}
