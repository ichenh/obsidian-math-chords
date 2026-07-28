export type NativeTikzEngineKind =
  | "lualatex"
  | "xelatex"
  | "pdflatex"
  | "latex-dvi"
  | "tectonic";

export interface NativeTikzEngine {
  kind: NativeTikzEngineKind;
  executablePath: string;
  dvisvgmPath?: string;
}

const CJK_RE =
  /[\u2e80-\u2fff\u3040-\u30ff\u3100-\u312f\u31a0-\u31bf\u31c0-\u31ef\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u;
const UNICODE_ENGINE_COMMAND_RE =
  /\\(?:usepackage(?:\[[^\]]*\])?\{fontspec\}|setmainfont\b|setsansfont\b|setmonofont\b|newfontfamily\b|directlua\b|luatex\b|XeTeX\b)/u;

export function containsCjkText(source: string): boolean {
  return CJK_RE.test(source);
}

export function nativeEnginePreference(
  source: string,
): readonly NativeTikzEngineKind[] {
  return containsCjkText(source) || UNICODE_ENGINE_COMMAND_RE.test(source)
    ? ["lualatex", "xelatex", "tectonic", "pdflatex", "latex-dvi"]
    : ["latex-dvi", "pdflatex", "lualatex", "xelatex", "tectonic"];
}

export function nativeEngineSupportsUnicode(
  kind: NativeTikzEngineKind,
): boolean {
  return kind === "lualatex" || kind === "xelatex" || kind === "tectonic";
}

export function nativeEngineKindFromFilename(
  filename: string,
): NativeTikzEngineKind | null {
  const normalized = filename
    .replace(/\.exe$/i, "")
    .trim()
    .toLowerCase();
  if (normalized === "lualatex") return "lualatex";
  if (normalized === "xelatex") return "xelatex";
  if (normalized === "pdflatex") return "pdflatex";
  if (normalized === "latex") return "latex-dvi";
  if (normalized === "tectonic") return "tectonic";
  return null;
}
