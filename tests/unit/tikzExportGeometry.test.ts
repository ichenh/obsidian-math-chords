import { describe, expect, it } from "vitest";
import {
  tikzExportOverlayScale,
  unionTikzExportBounds,
} from "../../src/tikz/exportGeometry";

describe("TikZ export geometry", () => {
  it("reverses the live SVG screen scale for exported overlays", () => {
    expect(tikzExportOverlayScale({ a: 1.5, b: 0 })).toBeCloseTo(
      2 / 3,
    );
    expect(tikzExportOverlayScale({ a: 0, b: 0.75 })).toBeCloseTo(
      4 / 3,
    );
  });

  it("falls back safely for a degenerate screen transform", () => {
    expect(tikzExportOverlayScale({ a: 0, b: 0 })).toBe(1);
  });

  it("includes calibrated labels outside the vector drawing bounds", () => {
    expect(
      unionTikzExportBounds(
        { x: 10, y: 20, width: 100, height: 50 },
        { x: -5, y: 15, width: 30, height: 80 },
      ),
    ).toEqual({ x: -5, y: 15, width: 115, height: 80 });
  });
});
