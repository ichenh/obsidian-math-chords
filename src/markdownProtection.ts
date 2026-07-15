export interface TextRange {
  from: number;
  to: number;
}

/** Markdown regions where textual math transformations must not run. */
export function findNonMathProtectedRanges(markdown: string): TextRange[] {
  let ranges: TextRange[] = [];
  const frontmatter = findFrontmatter(markdown);
  if (frontmatter) ranges.push(frontmatter);
  ranges.push(...findFencedCodeBlocks(markdown));
  ranges = mergeRanges(ranges);

  ranges.push(...findInlineCode(markdown, ranges));
  ranges = mergeRanges(ranges);

  ranges.push(...findHtmlComments(markdown, ranges));
  ranges = mergeRanges(ranges);

  ranges.push(...findHtmlCodeBlocks(markdown, ranges));
  return mergeRanges(ranges);
}

export function editableRanges(
  length: number,
  protectedRanges: TextRange[],
  from = 0,
  to = length,
): TextRange[] {
  const start = clamp(from, 0, length);
  const end = clamp(to, start, length);
  const editable: TextRange[] = [];
  let cursor = start;

  for (const range of protectedRanges) {
    if (range.to <= start) continue;
    if (range.from >= end) break;
    if (cursor < range.from) editable.push({ from: cursor, to: Math.min(range.from, end) });
    cursor = Math.max(cursor, range.to);
    if (cursor >= end) break;
  }

  if (cursor < end) editable.push({ from: cursor, to: end });
  return editable;
}

export function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: TextRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

function findFrontmatter(markdown: string): TextRange | null {
  const opening = /^(?:\uFEFF)?---[\t ]*(?:\r?\n|$)/.exec(markdown);
  if (!opening) return null;
  const closing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/gm;
  closing.lastIndex = opening[0].length;
  const match = closing.exec(markdown);
  return { from: 0, to: match ? match.index + match[0].length : markdown.length };
}

function findFencedCodeBlocks(markdown: string): TextRange[] {
  const ranges: TextRange[] = [];
  const opener = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(markdown)) !== null) {
    const marker = match[1][0];
    const minimumLength = match[1].length;
    if (marker === "`") {
      const markerAt = match[0].indexOf(match[1]);
      const info = match[0].slice(markerAt + minimumLength).replace(/[\r\n]+$/, "");
      if (info.includes("`")) continue;
    }
    const closer = new RegExp(
      `^ {0,3}${escapeRegExp(marker)}{${minimumLength},}[\\t ]*(?:\\r?\\n|$)`,
      "gm",
    );
    closer.lastIndex = opener.lastIndex;
    const closeMatch = closer.exec(markdown);
    const to = closeMatch ? closeMatch.index + closeMatch[0].length : markdown.length;
    ranges.push({ from: match.index, to });
    opener.lastIndex = to;
  }

  return ranges;
}

function findHtmlComments(markdown: string, excluded: TextRange[]): TextRange[] {
  const ranges: TextRange[] = [];
  for (const chunk of editableRanges(markdown.length, excluded)) {
    let cursor = chunk.from;
    while ((cursor = markdown.indexOf("<!--", cursor)) >= 0 && cursor < chunk.to) {
      const closeAt = markdown.indexOf("-->", cursor + 4);
      const to = closeAt >= 0 && closeAt + 3 <= chunk.to ? closeAt + 3 : chunk.to;
      ranges.push({ from: cursor, to });
      cursor = to;
    }
  }
  return ranges;
}

function findHtmlCodeBlocks(markdown: string, excluded: TextRange[]): TextRange[] {
  const ranges: TextRange[] = [];
  const stack: Array<"pre" | "code"> = [];
  let blockStart = -1;
  let cursor = 0;
  let excludedIndex = 0;

  while (cursor < markdown.length) {
    if (stack.length === 0) {
      while (excludedIndex < excluded.length && excluded[excludedIndex].to <= cursor) {
        excludedIndex += 1;
      }
      const blocked = excluded[excludedIndex];
      if (blocked && cursor >= blocked.from) {
        cursor = blocked.to;
        continue;
      }
    }

    const openAt = markdown.indexOf("<", cursor);
    if (openAt < 0) break;
    if (stack.length === 0) {
      const blocked = excluded[excludedIndex];
      if (blocked && openAt >= blocked.from) {
        cursor = blocked.to;
        continue;
      }
    }

    if (markdown.startsWith("<!--", openAt)) {
      const commentEnd = markdown.indexOf("-->", openAt + 4);
      cursor = commentEnd >= 0 ? commentEnd + 3 : markdown.length;
      continue;
    }

    const tag = parseCodeTag(markdown, openAt);
    if (!tag) {
      cursor = openAt + 1;
      continue;
    }

    if (!tag.closing && !tag.selfClosing) {
      if (stack.length === 0) blockStart = openAt;
      stack.push(tag.name);
    } else if (tag.closing && stack[stack.length - 1] === tag.name) {
      stack.pop();
      if (stack.length === 0) {
        ranges.push({ from: blockStart, to: tag.to });
        blockStart = -1;
      }
    }
    cursor = tag.to;
  }

  if (stack.length > 0 && blockStart >= 0) {
    ranges.push({ from: blockStart, to: markdown.length });
  }
  return ranges;
}

function parseCodeTag(
  text: string,
  from: number,
): { name: "pre" | "code"; closing: boolean; selfClosing: boolean; to: number } | null {
  let quote: "\"" | "'" | null = null;
  let end = from + 1;
  for (; end < text.length; end += 1) {
    const character = text[end];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") break;
  }
  if (end >= text.length) return null;

  const body = text.slice(from + 1, end);
  const match = /^\s*(\/)?\s*(pre|code)\b/i.exec(body);
  if (!match) return null;
  return {
    name: match[2].toLowerCase() as "pre" | "code",
    closing: Boolean(match[1]),
    selfClosing: /\/\s*$/.test(body),
    to: end + 1,
  };
}

function findInlineCode(markdown: string, protectedRanges: TextRange[]): TextRange[] {
  const ranges: TextRange[] = [];
  for (const chunk of editableRanges(markdown.length, protectedRanges)) {
    let cursor = chunk.from;
    while (cursor < chunk.to) {
      const openAt = markdown.indexOf("`", cursor);
      if (openAt < 0 || openAt >= chunk.to) break;
      const runLength = countRun(markdown, openAt, "`");
      let closeAt = openAt + runLength;

      while ((closeAt = markdown.indexOf("`".repeat(runLength), closeAt)) >= 0) {
        if (closeAt + runLength > chunk.to) break;
        if (markdown[closeAt - 1] !== "`" && markdown[closeAt + runLength] !== "`") {
          ranges.push({ from: openAt, to: closeAt + runLength });
          cursor = closeAt + runLength;
          break;
        }
        closeAt += runLength;
      }
      if (closeAt < 0 || closeAt >= chunk.to) cursor = openAt + runLength;
    }
  }
  return ranges;
}

function countRun(text: string, from: number, character: string): number {
  let to = from;
  while (text[to] === character) to += 1;
  return to - from;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
