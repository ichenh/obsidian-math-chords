import { describe, expect, it } from "vitest";
import {
  buildMathEnvironmentPreview,
  buildShortcutPreview,
  shortcutMatchesSearch,
} from "../../src/shortcutPresentation";

describe("buildShortcutPreview", () => {
  it("shows both operands in the default fraction preview", () => {
    expect(buildShortcutPreview("\\frac{$$}{}")).toEqual({
      latex: "\\frac{x}{y}",
      fallback: null,
    });
  });

  it("replaces the caret marker with neutral sample content", () => {
    expect(buildShortcutPreview("\\sqrt{$$}").latex).toBe("\\sqrt{x}");
  });

  it("adds a base to standalone superscripts and subscripts", () => {
    expect(buildShortcutPreview("^{$$}").latex).toBe("x^{x}");
    expect(buildShortcutPreview("_{$$}").latex).toBe("x_{x}");
  });

  it("makes otherwise invisible commands recognizable", () => {
    expect(buildShortcutPreview("'").latex).toBe("x'");
    expect(buildShortcutPreview("\\,").latex).toBe("x\\,x");
  });

  it.each([
    ["pmatrix", "1 & 2 \\\\ 3 & 4", "matrix"],
    ["bmatrix", "1 & 2 \\\\ 3 & 4", "matrix"],
    ["cases", "x, & x > 0 \\\\ 0, & x = 0", "cases"],
  ])(
    "uses representative multi-row content for the default %s shortcut",
    (environment, content, variant) => {
      const preview = buildShortcutPreview(
        `\\begin{${environment}}\n$$\n\\end{${environment}}`,
      );
      expect(preview.latex).toBe(`\\begin{${environment}}${content}\\end{${environment}}`);
      expect(preview.variant).toBe(variant);
    },
  );

  it.each([
    ["Angle brackets", "\\left\\langle$$\\right\\rangle", "\\left\\langle{x}\\right\\rangle"],
    ["Floor", "\\left\\lfloor$$\\right\\rfloor", "\\left\\lfloor{x}\\right\\rfloor"],
    ["Ceiling", "\\left\\lceil$$\\right\\rceil", "\\left\\lceil{x}\\right\\rceil"],
  ])("separates the %s placeholder from a preceding TeX control word", (_name, command, expected) => {
    expect(buildShortcutPreview(command).latex).toBe(expected);
  });

  it("uses a textual fallback for the display-math action", () => {
    expect(buildShortcutPreview("__DISPLAY_MATH__")).toEqual({
      latex: null,
      fallback: "$$",
    });
  });
});

describe("buildMathEnvironmentPreview", () => {
  it("uses representative multi-row content for cases and matrices", () => {
    expect(
      buildMathEnvironmentPreview({
        name: "cases",
        begin: "\\begin{cases}",
        end: "\\end{cases}",
      }),
    ).toContain("x, & x > 0 \\\\ 0, & x = 0");
    expect(
      buildMathEnvironmentPreview({
        name: "matrix",
        begin: "\\begin{matrix}",
        end: "\\end{matrix}",
      }),
    ).toContain("a & b \\\\ c & d");
  });
});

describe("shortcutMatchesSearch", () => {
  const shortcut = {
    keys: "G A",
    command: "\\alpha",
    name: "Alpha",
    group: "Greek",
  };

  it.each(["g a", "ALPHA", "greek", "\\alpha"])("matches %s", (query) => {
    expect(shortcutMatchesSearch(shortcut, query)).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(shortcutMatchesSearch(shortcut, "matrix")).toBe(false);
  });
});
