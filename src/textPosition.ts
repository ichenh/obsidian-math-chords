export interface TextPosition {
  line: number;
  ch: number;
}

/** Convert a UTF-16 document offset to an Obsidian-compatible line/ch position. */
export function offsetToTextPosition(text: string, offset: number): TextPosition {
  const target = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;

  for (let index = 0; index < target; index++) {
    if (text[index] !== "\n") continue;
    line++;
    lineStart = index + 1;
  }

  return { line, ch: target - lineStart };
}

export function replaceTextRange(
  document: string,
  from: number,
  to: number,
  replacement: string,
): string {
  return document.slice(0, from) + replacement + document.slice(to);
}
