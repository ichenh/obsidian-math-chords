import type { Editor } from "obsidian";
import {
  convertPastedLatexDelimiters,
  findLatexDelimiterConversions,
  findLatexDelimiterConversionsInRanges,
  type DelimiterChange,
  type DelimiterConversion,
} from "./delimiterConverter";

/** Converts every non-empty editor selection in one undoable transaction. */
export function convertLatexDelimitersInSelections(
  editor: Editor,
): DelimiterConversion | null {
  const ranges = editor.listSelections().map((selection) => ({
    from: editor.posToOffset(selection.anchor),
    to: editor.posToOffset(selection.head),
  }));
  if (ranges.every((range) => range.from === range.to)) return null;

  const conversion = findLatexDelimiterConversionsInRanges(editor.getValue(), ranges);
  applyDelimiterConversion(editor, conversion);
  return conversion;
}

/** Converts the active document in one undoable transaction. */
export function convertLatexDelimitersInDocument(editor: Editor): DelimiterConversion {
  const conversion = findLatexDelimiterConversions(editor.getValue());
  applyDelimiterConversion(editor, conversion);
  return conversion;
}

/** Replaces all selections with context-aware converted clipboard text. */
export function pasteConvertedLatexDelimiters(editor: Editor, pastedText: string): boolean {
  const document = editor.getValue();
  let didConvert = false;
  const changes = editor.listSelections().map((selection) => {
    const anchor = editor.posToOffset(selection.anchor);
    const head = editor.posToOffset(selection.head);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const converted = convertPastedLatexDelimiters(document, pastedText, from, to);
    if (converted !== null) didConvert = true;
    return {
      from: editor.offsetToPos(from),
      to: editor.offsetToPos(to),
      text: converted ?? pastedText,
    };
  });
  if (!didConvert) return false;

  editor.transaction({ changes });
  return true;
}

function applyDelimiterConversion(editor: Editor, conversion: DelimiterConversion): void {
  if (conversion.changes.length === 0) return;
  editor.transaction({
    changes: conversion.changes.map((change) => toEditorChange(editor, change)),
  });
}

function toEditorChange(editor: Editor, change: DelimiterChange) {
  return {
    from: editor.offsetToPos(change.from),
    to: editor.offsetToPos(change.to),
    text: change.text,
  };
}
