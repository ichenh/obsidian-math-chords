export type FloatingResizeDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export interface FloatingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function resizeFloatingRect(
  start: FloatingRect,
  direction: FloatingResizeDirection,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
  minWidth = 240,
  minHeight = 160,
): FloatingRect {
  let { left, top, width, height } = start;
  const right = start.left + start.width;
  const bottom = start.top + start.height;

  if (direction.includes("e")) {
    width = clamp(start.width + deltaX, minWidth, viewportWidth - start.left);
  } else if (direction.includes("w")) {
    left = clamp(start.left + deltaX, 0, right - minWidth);
    width = right - left;
  }

  if (direction.includes("s")) {
    height = clamp(
      start.height + deltaY,
      minHeight,
      viewportHeight - start.top,
    );
  } else if (direction.includes("n")) {
    top = clamp(start.top + deltaY, 0, bottom - minHeight);
    height = bottom - top;
  }

  return { left, top, width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
