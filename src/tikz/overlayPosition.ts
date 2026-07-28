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

export function fitTikzNodeBox(
  center: { x: number; y: number },
  minimum: { width: number; height: number },
  content: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const width = Math.max(1, minimum.width, content.width);
  const height = Math.max(1, minimum.height, content.height);
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
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

export type TikzNodeAnchor =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "north-east"
  | "north-west"
  | "south-east"
  | "south-west";

export function placeTikzAnchoredNode(
  reference: { left: number; top: number },
  anchor: TikzNodeAnchor,
  width: number,
  height: number,
): { left: number; top: number } {
  let { left, top } = reference;
  if (anchor.includes("west")) left += width / 2;
  if (anchor.includes("east")) left -= width / 2;
  if (anchor.includes("north")) top += height / 2;
  if (anchor.includes("south")) top -= height / 2;
  return { left, top };
}

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

export function placeTikzSlopedOverlay(
  anchor: { left: number; top: number },
  placement: TikzOverlayPlacement,
  width: number,
  height: number,
  gap: number,
  texAngle: number,
): { left: number; top: number } {
  let localX = 0;
  let localY = 0;
  if (placement.includes("left")) localX -= width / 2 + gap;
  if (placement.includes("right")) localX += width / 2 + gap;
  if (placement.includes("above")) localY -= height / 2 + gap;
  if (placement.includes("below")) localY += height / 2 + gap;
  const displayAngle = -texAngle * Math.PI / 180;
  return {
    left:
      anchor.left +
      localX * Math.cos(displayAngle) -
      localY * Math.sin(displayAngle),
    top:
      anchor.top +
      localX * Math.sin(displayAngle) +
      localY * Math.cos(displayAngle),
  };
}

export function tikzOverlayRotationTransform(
  texAngle: number,
  center: { left: number; top: number },
): string | null {
  if (!Number.isFinite(texAngle) || texAngle === 0) return null;
  return `rotate(${-texAngle} ${center.left} ${center.top})`;
}

export function tikzConnectorArrowTransform(
  oldTip: { x: number; y: number },
  newTip: { x: number; y: number },
  oldDirection: { x: number; y: number },
  newDirection: { x: number; y: number },
): string {
  const oldAngle = Math.atan2(oldDirection.y, oldDirection.x);
  const newAngle = Math.atan2(newDirection.y, newDirection.x);
  const degrees = (newAngle - oldAngle) * 180 / Math.PI;
  return `translate(${newTip.x} ${newTip.y}) rotate(${degrees}) translate(${-oldTip.x} ${-oldTip.y})`;
}

export function tikzEmbeddedOverlayBounds(
  center: { left: number; top: number },
  correction: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  return {
    x: center.left + correction.x - safeWidth / 2,
    y: center.top + correction.y - safeHeight / 2,
    width: safeWidth,
    height: safeHeight,
  };
}
