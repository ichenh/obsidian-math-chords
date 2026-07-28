import { describe, expect, it } from "vitest";
import {
  fitTikzNodeBox,
  placeTikzAnchoredNode,
  mapTikzOverlayPoint,
  placeTikzOverlay,
  placeTikzSlopedOverlay,
  tikzConnectorArrowTransform,
  tikzEmbeddedOverlayBounds,
  tikzOverlayRotationTransform,
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

  it("places sloped labels along the displayed line normal", () => {
    const point = placeTikzSlopedOverlay(
      { left: 100, top: 80 },
      "above",
      40,
      20,
      5,
      30,
    );
    expect(point.left).toBeCloseTo(92.5);
    expect(point.top).toBeCloseTo(67.0096);
  });

  it("uses the SVG display angle around the measured label center", () => {
    expect(tikzOverlayRotationTransform(30, { left: 92.5, top: 67.0096 }))
      .toBe("rotate(-30 92.5 67.0096)");
    expect(tikzOverlayRotationTransform(0, { left: 0, top: 0 })).toBeNull();
  });

  it("moves and rotates reconciled connector arrowheads with their tips", () => {
    expect(
      tikzConnectorArrowTransform(
        { x: 10, y: 20 },
        { x: 14, y: 25 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ),
    ).toBe("translate(14 25) rotate(90) translate(-10 -20)");
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
