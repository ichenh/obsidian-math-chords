import { extractMathContent, findMathRegionAtForEdit } from "./math";
import type { MathRegion } from "./types";

export type MathKind = MathRegion["kind"];

export type MathTogglePlan =
  | { type: "insert" }
  | { type: "blocked"; reason: "cross-kind-disabled" }
  | { type: "replace"; from: number; to: number; text: string; caret: number };

/**
 * Plans an inline/display-math command without touching the editor.
 * Non-empty selections always use the normal insertion path so their direction
 * cannot change the result.
 */
export function planMathToggle(
  document: string,
  anchor: number,
  head: number,
  targetKind: MathKind,
  allowCrossKind: boolean,
): MathTogglePlan {
  if (anchor !== head) return { type: "insert" };

  const region = findMathRegionAtForEdit(document, head);
  if (!region) return { type: "insert" };

  const rawContent = extractMathContent(document, region);
  const contentStart = region.from + (region.kind === "display" ? 2 : 1);
  const caretInContent = clamp(head - contentStart, 0, rawContent.length);

  if (region.kind === targetKind) {
    return {
      type: "replace",
      from: region.from,
      to: region.to,
      text: rawContent,
      caret: region.from + caretInContent,
    };
  }

  if (!allowCrossKind) {
    return { type: "blocked", reason: "cross-kind-disabled" };
  }

  if (targetKind === "inline") {
    const normalized = normalizeDisplayContentForInline(rawContent, caretInContent);
    return {
      type: "replace",
      from: region.from,
      to: region.to,
      text: `$${normalized.text}$`,
      caret: region.from + 1 + normalized.caret,
    };
  }

  return {
    type: "replace",
    from: region.from,
    to: region.to,
    text: `$$\n${rawContent}\n$$`,
    caret: region.from + 3 + caretInContent,
  };
}

function normalizeDisplayContentForInline(
  rawContent: string,
  rawCaret: number,
): { text: string; caret: number } {
  const leadingBreak = lineBreakLengthAt(rawContent, 0);
  const trailingBreak = trailingLineBreakLength(rawContent);
  const hasWrapperBreaks = leadingBreak > 0 && trailingBreak > 0;
  const start = hasWrapperBreaks ? leadingBreak : 0;
  const end = hasWrapperBreaks ? rawContent.length - trailingBreak : rawContent.length;
  const content = rawContent.slice(start, Math.max(start, end));
  const caret = clamp(rawCaret - start, 0, content.length);

  let normalized = "";
  const boundaryMap = new Array<number>(content.length + 1).fill(0);
  let index = 0;
  while (index < content.length) {
    boundaryMap[index] = normalized.length;
    const breakLength = lineBreakLengthAt(content, index);
    if (breakLength > 0) {
      normalized += " ";
      for (let step = 1; step <= breakLength; step++) {
        boundaryMap[index + step] = normalized.length;
      }
      index += breakLength;
      continue;
    }

    normalized += content[index];
    index++;
    boundaryMap[index] = normalized.length;
  }

  return { text: normalized, caret: boundaryMap[caret] ?? normalized.length };
}

function lineBreakLengthAt(text: string, index: number): number {
  if (text[index] === "\r") return text[index + 1] === "\n" ? 2 : 1;
  return text[index] === "\n" ? 1 : 0;
}

function trailingLineBreakLength(text: string): number {
  if (text.endsWith("\r\n")) return 2;
  return text.endsWith("\n") || text.endsWith("\r") ? 1 : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
