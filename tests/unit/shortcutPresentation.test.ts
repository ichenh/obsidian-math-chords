import { describe, expect, it } from "vitest";
import { buildShortcutPreview, shortcutMatchesSearch } from "../../src/shortcutPresentation";

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
