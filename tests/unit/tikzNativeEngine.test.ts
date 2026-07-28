import { describe, expect, it } from "vitest";
import {
  containsCjkText,
  nativeEngineKindFromFilename,
  nativeEnginePreference,
  nativeEngineSupportsUnicode,
} from "../../src/tikz/nativeEngine";

describe("native TikZ engine capabilities", () => {
  it("detects the major CJK writing systems", () => {
    expect(containsCjkText("中文")).toBe(true);
    expect(containsCjkText("日本語")).toBe(true);
    expect(containsCjkText("한국어")).toBe(true);
    expect(containsCjkText(String.raw`\node {$\rho$};`)).toBe(false);
  });

  it("prefers Unicode engines when CJK text is present", () => {
    expect(nativeEnginePreference("\\node {中文};").slice(0, 3)).toEqual([
      "lualatex",
      "xelatex",
      "tectonic",
    ]);
  });

  it("prefers the vector DVI path for ordinary TikZ", () => {
    expect(nativeEnginePreference(String.raw`\draw (0,0) circle (1);`)[0]).toBe(
      "latex-dvi",
    );
    expect(
      nativeEnginePreference(String.raw`\usepackage{fontspec}`)[0],
    ).toBe("lualatex");
  });

  it("recognizes supported executable names without binding to a distribution", () => {
    expect(nativeEngineKindFromFilename("lualatex.exe")).toBe("lualatex");
    expect(nativeEngineKindFromFilename("xelatex")).toBe("xelatex");
    expect(nativeEngineKindFromFilename("latex.exe")).toBe("latex-dvi");
    expect(nativeEngineKindFromFilename("unknown-tex.exe")).toBeNull();
  });

  it("reports which engines can use the Unicode font preamble", () => {
    expect(nativeEngineSupportsUnicode("lualatex")).toBe(true);
    expect(nativeEngineSupportsUnicode("xelatex")).toBe(true);
    expect(nativeEngineSupportsUnicode("tectonic")).toBe(true);
    expect(nativeEngineSupportsUnicode("pdflatex")).toBe(false);
  });
});
