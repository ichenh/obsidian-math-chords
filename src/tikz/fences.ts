import type { Text } from "@codemirror/state";

export interface TikzFenceBlock {
  from: number;
  to: number;
  widgetAt: number;
  source: string;
}

export function findTikzFenceBlocks(
  doc: Text,
  language: string,
): TikzFenceBlock[] {
  const blocks: TikzFenceBlock[] = [];
  const escapedLanguage = escapeRegExp(language);
  const openerPattern = new RegExp(
    `^ {0,3}(\`{3,}|~{3,})[ \\t]*${escapedLanguage}(?:[ \\t].*)?$`,
    "i",
  );

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const opener = doc.line(lineNumber);
    const match = opener.text.match(openerPattern);
    if (!match) continue;

    const marker = match[1];
    const closerPattern = new RegExp(
      `^ {0,3}${escapeRegExp(marker[0])}{${marker.length},}[ \\t]*$`,
    );
    for (
      let closerNumber = lineNumber + 1;
      closerNumber <= doc.lines;
      closerNumber++
    ) {
      const closer = doc.line(closerNumber);
      if (!closerPattern.test(closer.text)) continue;
      const contentFrom = opener.to < doc.length ? opener.to + 1 : opener.to;
      const contentTo = closer.from > 0 ? closer.from - 1 : closer.from;
      blocks.push({
        from: opener.from,
        to: closer.to,
        widgetAt: closer.to,
        source: doc.sliceString(contentFrom, Math.max(contentFrom, contentTo)),
      });
      lineNumber = closerNumber;
      break;
    }
  }
  return blocks;
}

export function findTikzFenceBlockAt(
  blocks: readonly TikzFenceBlock[],
  position: number,
): TikzFenceBlock | undefined {
  return blocks.find(
    (block) => position >= block.from && position < block.to,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
