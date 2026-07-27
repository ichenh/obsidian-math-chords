import { describe, expect, it } from "vitest";
import {
  createSingleImagePdf,
  exportFormatFromFilename,
} from "../../src/tikz/exportPreview";

describe("TikZ export", () => {
  it("wraps a JPEG stream in a valid single-page PDF", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = createSingleImagePdf(jpeg, 640, 480);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Width 640 /Height 480");
    expect(text).toContain("xref");
    expect(text.endsWith("%%EOF\n")).toBe(true);
    expect(Array.from(pdf).join(",")).toContain(
      Array.from(jpeg).join(","),
    );
  });

  it("selects the export encoder from the filename extension", () => {
    expect(exportFormatFromFilename("diagram.svg")).toBe("svg");
    expect(exportFormatFromFilename("diagram.PNG")).toBe("png");
    expect(exportFormatFromFilename("diagram.jpeg")).toBe("jpg");
    expect(exportFormatFromFilename("diagram.pdf")).toBe("pdf");
    expect(() => exportFormatFromFilename("diagram.txt")).toThrow(
      /\.svg, \.png, \.jpg/,
    );
  });
});
