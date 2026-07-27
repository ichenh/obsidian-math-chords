import { describe, expect, it } from "vitest";
import {
  centerTikzMathInk,
  mapTikzOverlayPoint,
  placeTikzOverlay,
} from "../../src/tikz/overlayPosition";

describe("TikZ MathJax overlay positioning", () => {
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

  it("centers the rendered MathJax ink instead of its asymmetric line box", () => {
    expect(
      centerTikzMathInk(
        { left: 100, top: 40, width: 50, height: 30 },
        { left: 108, top: 43, width: 36, height: 20 },
      ),
    ).toEqual({ x: -1, y: 2 });
  });

  it("places a right node from the actual rendered formula width", () => {
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
});
