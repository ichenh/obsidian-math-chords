import type { ExpandedSnippet } from "./types";

const PLACEHOLDER = "$$";

export function expandSnippet(template: string, selection: string): ExpandedSnippet {
  const markerIndex = template.indexOf(PLACEHOLDER);
  if (markerIndex === -1) {
    const length = template.length;
    return { text: template, anchor: length, head: length };
  }

  const text = template.replace(PLACEHOLDER, selection);
  return {
    text,
    anchor: markerIndex,
    head: markerIndex + selection.length,
  };
}

export function insertInlineMath(selection: string): { text: string; anchor: number; head: number } {
  if (selection) {
    const text = `$${selection}$`;
    return { text, anchor: 1, head: 1 + selection.length };
  }
  return { text: "$$", anchor: 1, head: 1 };
}

export function insertDisplayMath(selection: string): { text: string; anchor: number; head: number } {
  if (selection) {
    const text = `$$\n${selection}\n$$`;
    return { text, anchor: 3, head: 3 + selection.length };
  }
  const text = "$$\n\n$$";
  return { text, anchor: 3, head: 3 };
}
