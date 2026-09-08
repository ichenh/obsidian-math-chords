import { getMathContentBounds, MAX_DOC_LENGTH, scanMarkdownMathRegions } from "./math";
import { findNonMathProtectedRanges } from "./markdownProtection";

export type FormulaExportSource =
  | { ok: true; latex: string; display: boolean }
  | { ok: false; reason: "no-formula" | "multiple-formulas" | "protected" | "document-too-large" };

/** Selection offsets belong to one captured document; no note is modified. */
export function selectFormulaForExport(source: string, from: number, to: number): FormulaExportSource {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.length) {
    return { ok: false, reason: "no-formula" };
  }
  if (from === to && source.length > MAX_DOC_LENGTH) return { ok: false, reason: "document-too-large" };
  const protectedRanges = findNonMathProtectedRanges(source);
  if (protectedRanges.some((range) => from === to
    ? from >= range.from && from < range.to
    : from < range.to && to > range.from)) {
    return { ok: false, reason: "protected" };
  }
  const regions = scanMarkdownMathRegions(source, protectedRanges);
  if (from === to) {
    const region = regions.find((candidate) => {
      const bounds = getMathContentBounds(candidate);
      return from >= bounds.from && from <= bounds.to;
    });
    if (!region) return { ok: false, reason: "no-formula" };
    const bounds = getMathContentBounds(region);
    return formula(source.slice(bounds.from, bounds.to), region.kind === "display");
  }
  const selected = source.slice(from, to);
  const trimmed = selected.trim();
  const start = from + selected.indexOf(trimmed);
  const end = start + trimmed.length;
  const overlaps = regions.filter((region) => region.from < end && region.to > start);
  if (overlaps.length > 1) return { ok: false, reason: "multiple-formulas" };
  if (overlaps.length === 1) {
    const region = overlaps[0];
    const bounds = getMathContentBounds(region);
    if (start === region.from && end === region.to) {
      return formula(source.slice(bounds.from, bounds.to), region.kind === "display");
    }
    if (start < bounds.from || end > bounds.to) return { ok: false, reason: "no-formula" };
  }
  const delimiters = [...trimmed.matchAll(/\\[\s\S]|\$+/g)].filter((match) =>
    match[0][0] === "$" || /^\\[()[\]]$/.test(match[0]),
  );
  if (delimiters.length > 0) {
    const first = delimiters[0];
    const last = delimiters[delimiters.length - 1];
    const close = first[0] === "\\(" ? "\\)" : first[0] === "\\[" ? "\\]" : "";
    if (delimiters.length === 2 && first.index === 0 &&
        last.index + last[0].length === trimmed.length && last[0] === close) {
      return formula(trimmed.slice(2, -2), first[0] === "\\[");
    }
    return { ok: false, reason: delimiters.length >= 4 ? "multiple-formulas" : "no-formula" };
  }
  return formula(trimmed, true);
}

function formula(latex: string, display: boolean): FormulaExportSource {
  return latex.trim() ? { ok: true, latex, display } : { ok: false, reason: "no-formula" };
}

/** A block action is explicit; unlike caret commands, it can address a large document. */
export function displayFormulaAtPosition(source: string, position: number): string | null {
  if (!Number.isInteger(position) || position < 0 || position > source.length) return null;
  const regions = scanMarkdownMathRegions(source).filter((candidate) => candidate.kind === "display");
  const region = regions.find((candidate) => position >= candidate.from && position < candidate.to)
    ?? regions.find((candidate) => position === candidate.to);
  if (!region) return null;
  const bounds = getMathContentBounds(region);
  return source.slice(bounds.from, bounds.to);
}

/** Refuse ambiguous source/DOM mappings rather than export a neighbouring formula. */
export function displayFormulaInSection(
  source: string, lineStart: number, lineEnd: number, index: number, blockCount: number,
): string | null {
  if (index < 0 || index >= blockCount || lineStart < 0 || lineEnd < lineStart) return null;
  const lines = source.split("\n");
  if (lineEnd >= lines.length) return null;
  const from = lines.slice(0, lineStart).reduce((offset, line) => offset + line.length + 1, 0);
  const to = from + lines.slice(lineStart, lineEnd + 1).join("\n").length;
  const regions = scanMarkdownMathRegions(source).filter((region) =>
    region.kind === "display" && region.from >= from && region.to <= to);
  if (regions.length !== blockCount) return null;
  const bounds = getMathContentBounds(regions[index]);
  return source.slice(bounds.from, bounds.to);
}
