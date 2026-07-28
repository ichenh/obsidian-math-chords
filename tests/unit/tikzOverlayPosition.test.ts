import { describe, expect, it } from "vitest";
import {
  fitTikzNodeBox,
  placeTikzAnchoredNode,
  mapTikzOverlayPoint,
  placeTikzOverlay,
  tikzEmbeddedOverlayBounds,
} from "../../src/tikz/overlayPosition";

describe("TikZ MathJax overlay positioning", () => {
  it("expands node backgrounds to the measured overlay without shrinking minima", () => {
    expect(
      fitTikzNodeBox(
        { x: 100, y: 50 },
        { width: 120, height: 40 },
        { width: 110, height: 72 },
      ),
    ).toEqual({ x: 40, y: 14, width: 120, height: 72 });
  });

  it("reapplies cardinal and diagonal node anchors after actual measurement", () => {
    expect(
      placeTikzAnchoredNode(
        { left: 100, top: 50 },
        "north-east",
        80,
        40,
      ),
    ).toEqual({ left: 60, top: 70 });
    expect(
      placeTikzAnchoredNode(
        { left: 100, top: 50 },
        "west",
        80,
        40,
      ),
    ).toEqual({ left: 140, top: 50 });
  });
  it("uses the vector anchor coordinates instead of half the label width", () => {
    expect(
      mapTikzOverlayPoint(
        { a: 2, b: 0, c: 0, d: 2, e: 30, f: 40 },
        120,
        80,
        10,
        15,
      ),
    ).toEqual({ left: 260, top: 185 });
  });

  it("preserves rotation and skew terms from the SVG screen transform", () => {
    expect(
      mapTikzOverlayPoint(
        { a: 0, b: 1, c: -1, d: 0, e: 100, f: 50 },
        20,
        5,
        0,
        0,
      ),
    ).toEqual({ left: 95, top: 70 });
  });

  it("places a right node from the complete rendered node box", () => {
    expect(
      placeTikzOverlay(
        { left: 100, top: 80 },
        "right",
        24,
        18,
        5,
        5,
      ),
    ).toEqual({ left: 117, top: 80 });
  });

  it("places diagonal nodes from the actual rendered box", () => {
    expect(
      placeTikzOverlay(
        { left: 100, top: 80 },
        "above-left",
        24,
        18,
        5,
        4,
      ),
    ).toEqual({ left: 83, top: 67 });
  });

  it("bakes the corrected label box into SVG user coordinates", () => {
    expect(
      tikzEmbeddedOverlayBounds(
        { left: 120, top: 80 },
        { x: -2, y: 3 },
        40,
        18,
      ),
    ).toEqual({ x: 98, y: 74, width: 40, height: 18 });
  });
});
