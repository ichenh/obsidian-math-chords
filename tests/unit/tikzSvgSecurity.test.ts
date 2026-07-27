import { describe, expect, it } from "vitest";
import { isSafeSvgAttributeValue } from "../../src/tikz/svgSecurity";

describe("TikZ SVG attribute security", () => {
  it("allows local SVG references used by gradients, markers, and masks", () => {
    expect(isSafeSvgAttributeValue("fill", "url(#gradient-1)")).toBe(true);
    expect(isSafeSvgAttributeValue("marker-end", "url('#arrow')")).toBe(true);
    expect(isSafeSvgAttributeValue("mask", "none")).toBe(true);
    expect(isSafeSvgAttributeValue("href", "#glyph")).toBe(true);
  });

  it("rejects external or executable SVG references", () => {
    expect(
      isSafeSvgAttributeValue("fill", "url(https://example.com/paint.svg#x)"),
    ).toBe(false);
    expect(
      isSafeSvgAttributeValue("stroke", "url(file:///secret.svg#paint)"),
    ).toBe(false);
    expect(isSafeSvgAttributeValue("href", "data:image/svg+xml;base64,AA==")).toBe(
      false,
    );
    expect(
      isSafeSvgAttributeValue("style", "fill:url(https://example.com/x)"),
    ).toBe(false);
  });
});
