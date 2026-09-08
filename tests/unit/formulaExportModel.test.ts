import { describe, expect, it } from "vitest";
import { displayFormulaAtPosition, displayFormulaInSection, selectFormulaForExport } from "../../src/formulaExportModel";

describe("single formula export selection", () => {
  it.each([
    ["before $x+1$ after", 9, "x+1", false],
    ["$$\r\nx^2\r\n$$", 5, "\r\nx^2\r\n", true],
  ])("captures only the formula containing the caret: %s", (source, caret, latex, display) => {
    expect(selectFormulaForExport(source, caret, caret)).toEqual({ ok: true, latex, display });
  });

  it.each([
    [" $x$ ", "x", false],
    ["$$x+y$$", "x+y", true],
    [String.raw`\[\frac{a}{b}\]`, String.raw`\frac{a}{b}`, true],
    [String.raw`\(x\)`, "x", false],
    [String.raw`\frac{a}{b}`, String.raw`\frac{a}{b}`, true],
    [String.raw`\text{\$5}`, String.raw`\text{\$5}`, true],
  ])("exports one complete selected formula or raw LaTeX: %s", (source, latex, display) => {
    expect(selectFormulaForExport(source, 0, source.length)).toEqual({ ok: true, latex, display });
  });

  it("gives a content selection precedence over the surrounding formula", () => {
    expect(selectFormulaForExport("$x+y$", 1, 2)).toEqual({ ok: true, latex: "x", display: true });
  });

  it.each(["$x$ and $y$", "$$x$$\n$$y$$", String.raw`\(x\) \(y\)`])("rejects multiple formulas: %s", (source) => {
    expect(selectFormulaForExport(source, 0, source.length)).toEqual({ ok: false, reason: "multiple-formulas" });
  });

  it.each([
    "`$x$`", "```latex\n$x$\n```", "---\nkey: $x$\n---\n", "<!-- $x$ -->", "<pre>$x$</pre>", "<code>$x$</code>",
  ])("rejects protected Markdown both for selections and carets: %s", (source) => {
    const from = source.indexOf("x");
    expect(selectFormulaForExport(source, from, from)).toEqual({ ok: false, reason: "protected" });
    expect(selectFormulaForExport(source, from, from + 1)).toEqual({ ok: false, reason: "protected" });
  });

  it.each(["cost $5 and $10", "plain text", "$$unfinished", String.raw`\(x\)`])("requires Markdown math at a caret: %s", (source) => {
    expect(selectFormulaForExport(source, source.length, source.length)).toEqual({ ok: false, reason: "no-formula" });
  });

  it("rejects partial delimiters and invalid offsets", () => {
    expect(selectFormulaForExport("$x+y$", 0, 3)).toEqual({ ok: false, reason: "no-formula" });
    expect(selectFormulaForExport("$x$", -1, 2)).toEqual({ ok: false, reason: "no-formula" });
    expect(selectFormulaForExport("$x$", 2, 1)).toEqual({ ok: false, reason: "no-formula" });
  });

  it("guards large caret operations while retaining explicit selection export", () => {
    const source = "$x$" + " ".repeat(100_000);
    expect(selectFormulaForExport(source, 1, 1)).toEqual({ ok: false, reason: "document-too-large" });
    expect(selectFormulaForExport(source, 0, 3)).toEqual({ ok: true, latex: "x", display: false });
  });
});

describe("rendered display formula source", () => {
  it("resolves the clicked block independently of a caret, including widget boundaries", () => {
    const source = "$inline$\n$$first$$\n$$second$$";
    for (const offset of [source.indexOf("$$second"), source.indexOf("second"), source.length]) {
      expect(displayFormulaAtPosition(source, offset)).toBe("second");
    }
    expect(displayFormulaAtPosition(source, 2)).toBeNull();
    expect(displayFormulaAtPosition("$$x$$\n$$y$$", 6)).toBe("y");
  });

  it("never resolves code or frontmatter as an exportable formula block", () => {
    const source = "---\nvalue: $$x$$\n---\n```\n$$y$$\n```\n$$z$$";
    expect(displayFormulaAtPosition(source, source.indexOf("x"))).toBeNull();
    expect(displayFormulaAtPosition(source, source.indexOf("y"))).toBeNull();
    expect(displayFormulaAtPosition(source, source.indexOf("z"))).toBe("z");
  });

  it("uses section line bounds and formula order, preserving multiline TeX", () => {
    const source = "$$other$$\r\nparagraph\r\n$$a$$\r\n$$\r\nb+c\r\n$$";
    expect(displayFormulaInSection(source, 2, 5, 0, 2)).toBe("a");
    expect(displayFormulaInSection(source, 2, 5, 1, 2)).toBe("\r\nb+c\r\n");
    expect(displayFormulaInSection(source, 2, 5, 0, 1)).toBeNull();
    expect(displayFormulaInSection(source, 2, 5, -1, 2)).toBeNull();
    expect(displayFormulaInSection(source, 2, 9, 0, 2)).toBeNull();
  });

  it("allows explicitly clicked blocks in large notes", () => {
    const source = "text\n".repeat(20_001) + "$$x$$";
    expect(displayFormulaAtPosition(source, source.length - 3)).toBe("x");
  });
});
