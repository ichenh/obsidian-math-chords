import { describe, expect, it } from "vitest";
import { pdfToSvgArguments } from "../../src/tikz/nativeVector";

describe("native TikZ vector conversion", () => {
  it("converts PDF output to path-based, high-precision SVG", () => {
    expect(pdfToSvgArguments("main.pdf", "main.svg")).toEqual([
      "--pdf",
      "--no-fonts",
      "--precision=6",
      "--output=main.svg",
      "main.pdf",
    ]);
  });
});
