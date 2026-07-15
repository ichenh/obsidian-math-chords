import {
  findMathRegionAtForEdit,
  getMathContentBounds,
  scanMarkdownMathRegions,
} from "./math";
import type { MathEnvironment } from "./types";

export type MathEnvironmentWrapPlan =
  | { type: "blocked"; reason: "inline-math" }
  | { type: "blocked"; reason: "selection-overlaps-math" }
  | { type: "replace"; from: number; to: number; text: string; caret: number };

/** Plan one complete, undoable display-environment command. */
export function planMathEnvironmentWrap(
  document: string,
  anchor: number,
  head: number,
  environment: MathEnvironment,
): MathEnvironmentWrapPlan {
  const selectionFrom = Math.min(anchor, head);
  const selectionTo = Math.max(anchor, head);
  const selectedRegions = anchor === head ? [] : scanMarkdownMathRegions(document);
  const containingRegion = selectedRegions.find(
    (candidate) => selectionFrom >= candidate.from && selectionTo <= candidate.to,
  );
  const overlapsMath = selectedRegions.some(
    (candidate) => selectionFrom < candidate.to && selectionTo > candidate.from,
  );
  const region =
    containingRegion ??
    (anchor === head ? findMathRegionAtForEdit(document, head) : null);
  if (region?.kind === "inline") return { type: "blocked", reason: "inline-math" };
  if (!region && overlapsMath) {
    return { type: "blocked", reason: "selection-overlaps-math" };
  }

  let from = selectionFrom;
  let to = selectionTo;
  let content = document.slice(from, to);

  if (region?.kind === "display") {
    from = region.from;
    to = region.to;
    const bounds = getMathContentBounds(region);
    content = document.slice(bounds.from, bounds.to);
  }

  const lineBreak = content.includes("\r\n") ? "\r\n" : "\n";
  const core = stripOneWrapperLineBreak(content);
  const beforeCore = `$$${lineBreak}${environment.begin}${lineBreak}`;
  const text = `${beforeCore}${core}${lineBreak}${environment.end}${lineBreak}$$`;

  return {
    type: "replace",
    from,
    to,
    text,
    caret: from + beforeCore.length,
  };
}

function stripOneWrapperLineBreak(content: string): string {
  const leading = lineBreakLengthAt(content, 0);
  const trailing = trailingLineBreakLength(content);
  if (leading === 0 || trailing === 0) return content;
  return content.slice(leading, content.length - trailing);
}

function lineBreakLengthAt(text: string, index: number): number {
  if (text[index] === "\r") return text[index + 1] === "\n" ? 2 : 1;
  return text[index] === "\n" ? 1 : 0;
}

function trailingLineBreakLength(text: string): number {
  if (text.endsWith("\r\n")) return 2;
  return text.endsWith("\n") || text.endsWith("\r") ? 1 : 0;
}
