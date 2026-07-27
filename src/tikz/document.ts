const DOCUMENT_CLASS_RE = /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/;
const DOCUMENT_BEGIN_RE = /\\begin\s*\{document\}/;
const TIKZPICTURE_BEGIN_RE = /\\begin\s*\{tikzpicture\}/;

export interface CreateTikzDocumentOptions {
  unicodeEngine?: "lua" | "xe";
  fonts?: TikzFontPreferences;
  locale?: string;
}

export function createTikzDocument(
  source: string,
  options: CreateTikzDocumentOptions = {},
): string {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (DOCUMENT_CLASS_RE.test(normalized)) return normalized;

  const preamble = [
    "\\documentclass[tikz,border=2pt]{standalone}",
    "\\usepackage{amsmath}",
    "\\usepackage{tikz}",
    ...(options.unicodeEngine && containsLiteralCjk(normalized)
      ? unicodeFontPreamble(
          options.unicodeEngine,
          normalized,
          options.fonts ?? EMPTY_TIKZ_FONT_PREFERENCES,
          options.locale,
        )
      : []),
  ];

  if (DOCUMENT_BEGIN_RE.test(normalized)) {
    return [
      ...preamble,
      normalized,
      "",
    ].join("\n");
  }

  if (TIKZPICTURE_BEGIN_RE.test(normalized)) {
    return [
      ...preamble,
      "\\begin{document}",
      normalized,
      "\\end{document}",
      "",
    ].join("\n");
  }

  return [
    ...preamble,
    "\\begin{document}",
    "\\begin{tikzpicture}",
    normalized,
    "\\end{tikzpicture}",
    "\\end{document}",
    "",
  ].join("\n");
}

function containsLiteralCjk(source: string): boolean {
  return /[\u2e80-\u2fff\u3040-\u30ff\u3100-\u312f\u31a0-\u31bf\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(
    source,
  );
}

function unicodeFontPreamble(
  engine: "lua" | "xe",
  source: string,
  fonts: TikzFontPreferences,
  locale = "",
): string[] {
  const profile = detectTikzTextProfile(source, locale);
  const cjkFonts = tikzFontCandidates(profile, fonts);
  const latinFont = normalizeTikzFontName(fonts.latin) || "Latin Modern Roman";
  if (engine === "lua") {
    return [
      "\\usepackage{fontspec}",
      "\\directlua{mathchordsfallbacks={}}",
      ...cjkFonts.flatMap(luaFallbackFont),
      "\\directlua{luaotfload.add_fallback('mathchordscjk',mathchordsfallbacks)}",
      `\\setmainfont{${latinFont}}[RawFeature={fallback=mathchordscjk}]`,
    ];
  }
  const cjkSelection = nestedFontSelection(cjkFonts, "\\setCJKmainfont");
  const mainSelection = nestedFontSelection(cjkFonts, "\\setmainfont");
  return [
    "\\usepackage{fontspec}",
    `\\setmainfont{${latinFont}}`,
    "\\IfFileExists{xeCJK.sty}{\\usepackage{xeCJK}}{}",
    "\\ifdefined\\setCJKmainfont",
    ...cjkSelection.map((line) => `  ${line}`),
    "\\else",
    ...mainSelection.map((line) => `  ${line}`),
    "\\fi",
  ];
}

function luaFallbackFont(fontName: string): string[] {
  return [
    `\\IfFontExistsTF{${fontName}}{%`,
    `  \\directlua{table.insert(mathchordsfallbacks,'${fontName}:mode=harf;')}%`,
    "}{}",
  ];
}

function nestedFontSelection(fontNames: string[], command: string): string[] {
  return fontNames.map((fontName, index) => {
    const fallback = index === fontNames.length - 1 ? "{}" : "{%";
    return `${"  ".repeat(index)}\\IfFontExistsTF{${fontName}}{${command}{${fontName}}}${fallback}`;
  }).concat(fontNames.slice(1).map((_, index) =>
    `${"  ".repeat(fontNames.length - index - 2)}}%`,
  ));
}
import {
  detectTikzTextProfile,
  EMPTY_TIKZ_FONT_PREFERENCES,
  normalizeTikzFontName,
  tikzFontCandidates,
  type TikzFontPreferences,
} from "./fonts";
