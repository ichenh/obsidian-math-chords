import type { Editor } from "obsidian";
import { findMathRegionAt, getMathContentBounds } from "./math";

export interface BraceStop {
  start: number;
  end: number;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

/** Brace argument ranges `{…}` inside the math region containing `offset`. */
export function findBraceStopsInMath(text: string, offset: number): BraceStop[] {
  const region = findMathRegionAt(text, offset);
  if (!region) return [];

  const { from, to } = getMathContentBounds(region);
  const content = text.slice(from, to);
  const stops: BraceStop[] = [];
  const stack: number[] = [];

  for (let i = 0; i < content.length; i++) {
    if (isEscaped(content, i)) continue;
    const ch = content[i];
    if (ch === "{") {
      stack.push(i);
    } else if (ch === "}" && stack.length > 0) {
      const open = stack.pop()!;
      stops.push({ start: from + open + 1, end: from + i });
    }
  }

  return stops;
}

export function findNextBraceStop(stops: BraceStop[], offset: number): BraceStop | null {
  if (stops.length === 0) return null;

  const inside = stops.findIndex((stop) => offset >= stop.start && offset <= stop.end);
  if (inside >= 0) {
    return stops[inside + 1] ?? null;
  }

  const after = stops.find((stop) => stop.start > offset);
  return after ?? stops[0] ?? null;
}

export function findPrevBraceStop(stops: BraceStop[], offset: number): BraceStop | null {
  if (stops.length === 0) return null;

  const inside = stops.findIndex((stop) => offset >= stop.start && offset <= stop.end);
  if (inside > 0) return stops[inside - 1] ?? null;
  if (inside === 0) return null;

  for (let i = stops.length - 1; i >= 0; i--) {
    const stop = stops[i];
    if (stop && stop.end < offset) return stop;
  }
  return null;
}

export function jumpToBrace(editor: Editor, direction: "next" | "prev"): boolean {
  const doc = editor.getValue();
  const offset = editor.posToOffset(editor.getCursor());
  const stops = findBraceStopsInMath(doc, offset);
  if (stops.length === 0) return false;

  const target =
    direction === "next" ? findNextBraceStop(stops, offset) : findPrevBraceStop(stops, offset);
  if (!target) return false;

  editor.setSelection(editor.offsetToPos(target.start), editor.offsetToPos(target.end));
  return true;
}
