export interface TikzOverlayMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface TikzOverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type TikzOverlayPlacement =
  | "above"
  | "below"
  | "left"
  | "right"
  | "above-left"
  | "above-right"
  | "below-left"
  | "below-right";

export function mapTikzOverlayPoint(
  matrix: TikzOverlayMatrix,
  x: number,
  y: number,
  containerLeft: number,
  containerTop: number,
): { left: number; top: number } {
  return {
    left: matrix.a * x + matrix.c * y + matrix.e - containerLeft,
    top: matrix.b * x + matrix.d * y + matrix.f - containerTop,
  };
}

export function centerTikzMathInk(
  outer: TikzOverlayRect,
  ink: TikzOverlayRect,
): { x: number; y: number } {
  return {
    x: outer.left + outer.width / 2 - (ink.left + ink.width / 2),
    y: outer.top + outer.height / 2 - (ink.top + ink.height / 2),
  };
}

export function placeTikzOverlay(
  anchor: { left: number; top: number },
  placement: TikzOverlayPlacement,
  width: number,
  height: number,
  gapX: number,
  gapY: number,
): { left: number; top: number } {
  let { left, top } = anchor;
  if (placement.includes("left")) {
    left -= width / 2 + gapX;
  } else if (placement.includes("right")) {
    left += width / 2 + gapX;
  }
  if (placement.includes("above")) {
    top -= height / 2 + gapY;
  } else if (placement.includes("below")) {
    top += height / 2 + gapY;
  }
  return { left, top };
}
