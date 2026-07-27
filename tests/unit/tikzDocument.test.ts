import { describe, expect, it } from "vitest";
import { createTikzDocument } from "../../src/tikz/document";

describe("TikZ document preparation", () => {
  it("wraps drawing commands in a standalone TikZ document", () => {
    const document = createTikzDocument("\\draw (0,0) -- (1,1);");
    expect(document).toContain("\\documentclass[tikz,border=2pt]{standalone}");
    expect(document).toContain("\\usepackage{amsmath}");
    expect(document).toContain("\\begin{tikzpicture}");
    expect(document).toContain("\\draw (0,0) -- (1,1);");
  });

  it("loads bold math support for generated TeX documents", () => {
    const document = createTikzDocument(
      String.raw`\node {$\boldsymbol{F}_{\mathrm e}$};`,
    );
    expect(document.indexOf("\\usepackage{amsmath}")).toBeLessThan(
      document.indexOf("\\begin{document}"),
    );
  });

  it("keeps complete documents unchanged", () => {
    const source = "\\documentclass{standalone}\n\\begin{document}\nX\n\\end{document}";
    expect(createTikzDocument(source)).toBe(source);
  });

  it("adds only the preamble when the source already has a document body", () => {
    const document = createTikzDocument(
      "\\usepackage{tikz-cd}\n\\begin{document}\nX\n\\end{document}",
    );
    expect(document).toContain("\\usepackage{tikz-cd}");
    expect(document.match(/\\begin\{document\}/g)).toHaveLength(1);
    expect(document).not.toContain("\\begin{tikzpicture}");
  });

  it("does not nest a complete tikzpicture environment", () => {
    const source =
      "\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}";
    const document = createTikzDocument(source);
    expect(document.match(/\\begin\{tikzpicture\}/g)).toHaveLength(1);
    expect(document).toContain("\\begin{document}");
    expect(document).toContain("\\end{document}");
  });

  it("adds a bounded system-font fallback for CJK on Unicode engines", () => {
    const document = createTikzDocument("\\node {中文};", {
      unicodeEngine: "lua",
    });
    expect(document).toContain("\\usepackage{fontspec}");
    expect(document).toContain("luaotfload.add_fallback");
    expect(document).toContain("Noto Serif CJK SC:mode=harf;");
    expect(document).toContain("Source Han Serif SC:mode=harf;");
    expect(document).toContain("SimSun:mode=harf;");
    expect(document).not.toContain("Noto Sans CJK");
  });

  it("keeps Latin Modern and selects a matching serif CJK font on XeTeX", () => {
    const document = createTikzDocument("\\node {中文};", {
      unicodeEngine: "xe",
    });
    expect(document).toContain("\\setmainfont{Latin Modern Roman}");
    expect(document).toContain("\\IfFileExists{xeCJK.sty}");
    expect(document).toContain("\\setCJKmainfont{Noto Serif CJK SC}");
    expect(document).toContain("\\setCJKmainfont{Source Han Serif SC}");
    expect(document).toContain("\\setCJKmainfont{SimSun}");
  });

  it("prefers Japanese and Korean Source Han families for matching text", () => {
    const japanese = createTikzDocument("\\node {日本語};", {
      unicodeEngine: "xe",
      locale: "ja",
    });
    const korean = createTikzDocument("\\node {한국어};", {
      unicodeEngine: "xe",
      locale: "ko",
    });
    expect(japanese.indexOf("Source Han Serif JP")).toBeLessThan(
      japanese.indexOf("Noto Serif CJK JP"),
    );
    expect(japanese).toContain("Yu Mincho");
    expect(korean.indexOf("Source Han Serif K")).toBeLessThan(
      korean.indexOf("Noto Serif CJK KR"),
    );
    expect(korean).toContain("Batang");
  });

  it("puts a safe custom script font before automatic fallbacks", () => {
    const document = createTikzDocument("\\node {日本語};", {
      unicodeEngine: "lua",
      locale: "ja",
      fonts: {
        latin: "",
        simplifiedChinese: "",
        traditionalChinese: "",
        japanese: "My Japanese Serif",
        korean: "",
      },
    });
    expect(document.indexOf("My Japanese Serif:mode=harf;")).toBeLessThan(
      document.indexOf("Source Han Serif JP:mode=harf;"),
    );
  });

  it("does not add fontspec for non-Unicode engines", () => {
    const document = createTikzDocument("\\node {中文};");
    expect(document).not.toContain("\\usepackage{fontspec}");
  });
});
