import { describe, expect, it } from "vitest";
import { unionTikzSvgBounds } from "../../src/tikz/svgGeometry";

describe("TikZ SVG visual bounds", () => {
  it("retains the renderer margin that protects strokes and markers", () => {
    expect(
      unionTikzSvgBounds(
        { x: -8, y: -8, width: 116, height: 66 },
        { x: 0, y: 0, width: 100, height: 50 },
        1,
      ),
    ).toEqual({ x: -8, y: -8, width: 116, height: 66 });
  });

  it("expands for labels outside the original renderer bounds", () => {
    expect(
      unionTikzSvgBounds(
        { x: 0, y: 0, width: 100, height: 50 },
        { x: -20, y: 5, width: 130, height: 60 },
        1,
      ),
    ).toEqual({ x: -21, y: 0, width: 132, height: 66 });
  });
});
