import { describe, expect, it } from "vitest";
import {
  svgLengthToCssPixels,
  tikzPdfPixelRatio,
  tikzSvgCssScale,
} from "../../src/tikz/displayMetrics";

describe("TikZ cross-backend display metrics", () => {
  it("converts SVG physical units to CSS pixels", () => {
    expect(svgLengthToCssPixels("96px")).toBeCloseTo(96);
    expect(svgLengthToCssPixels("72pt")).toBeCloseTo(96);
    expect(svgLengthToCssPixels("2.54cm")).toBeCloseTo(96);
    expect(svgLengthToCssPixels("25.4mm")).toBeCloseTo(96);
    expect(svgLengthToCssPixels("1in")).toBeCloseTo(96);
  });

  it("preserves an already-applied WASM display scale", () => {
    expect(tikzSvgCssScale("150", 100, true)).toBeCloseTo(1.5);
  });

  it("applies the shared display scale to native TeX SVG", () => {
    expect(tikzSvgCssScale("100pt", 100, false)).toBeCloseTo(2);
  });

  it("keeps pre-scaled TeX and WASM physically equivalent", () => {
    const wasmCentimeter =
      tikzSvgCssScale("56.692px", 37.795, true) * 37.795;
    const texCentimeter =
      tikzSvgCssScale("42.675pt", 28.45, true) * 28.45;
    expect(wasmCentimeter).toBeCloseTo(texCentimeter, 0);
  });

  it("uses publication-density PDF fallbacks for print documents", () => {
    expect(tikzPdfPixelRatio(400, 300, 1.5, 1, true)).toBe(4);
    expect(tikzPdfPixelRatio(400, 300, 1.5, 1, false)).toBe(2);
  });

  it("bounds PDF fallback memory and dimensions", () => {
    const ratio = tikzPdfPixelRatio(4_000, 3_000, 1.5, 1, true);
    expect(4_000 * 1.5 * ratio).toBeLessThanOrEqual(8_192);
    expect(4_000 * 3_000 * 1.5 ** 2 * ratio ** 2)
      .toBeLessThanOrEqual(16_000_000);
  });
});
