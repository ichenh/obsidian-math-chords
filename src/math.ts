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

/** True when an inline `$…` opener before `offset` has no closing `$` before `offset`. */
export function hasUnclosedInlineMathBefore(text: string, offset: number): boolean {
  if (offset <= 0 || text.length > MAX_DOC_LENGTH) return false;

  let inlineOpen = false;
  for (let i = 0; i < offset; i++) {
    if (text[i] !== "$" || isEscaped(text, i)) continue;

    if (i < text.length - 1 && text[i + 1] === "$") {
      i += 2;
      while (i < offset - 1) {
        if (text[i] === "$" && text[i + 1] === "$" && !isEscaped(text, i)) {
          i += 2;
          break;
        }
        i++;
      }
      i--;
      continue;
    }

    inlineOpen = !inlineOpen;
  }
  return inlineOpen;
}

function touchesInlineMathClose(text: string, offset: number): boolean {
  if (offset <= 0 || offset > text.length) return false;
  const prev = findMathRegionAt(text, offset - 1);
  return prev?.kind === "inline" && offset >= prev.to;
}

/** Whether `wrapOutsideMath` should add `$…$` around a snippet at `[from, to]`. */
export function shouldAutoWrapSnippet(text: string, from: number, to: number): boolean {
  if (text.length > MAX_DOC_LENGTH) return true;

  const start = Math.max(0, from);
  const end = Math.min(to, text.length);
  for (let offset = start; offset <= end; offset++) {
    if (findMathRegionAt(text, offset)) return false;
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
  if (touchesInlineMathClose(text, from)) {
    const prev = findMathRegionAt(text, from - 1)!;
    return { from: prev.to - 1, to: prev.to - 1 };
  }
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
