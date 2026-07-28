export interface TikzSvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function unionTikzSvgBounds(
  original: TikzSvgBounds,
  content: TikzSvgBounds,
  contentPadding: number,
): TikzSvgBounds {
  const padding = Math.max(0, contentPadding);
  const padded = {
    x: content.x - padding,
    y: content.y - padding,
    width: content.width + padding * 2,
    height: content.height + padding * 2,
  };
  if (!isUsableBounds(original)) return padded;
  const x = Math.min(original.x, padded.x);
  const y = Math.min(original.y, padded.y);
  const right = Math.max(
    original.x + original.width,
    padded.x + padded.width,
  );
  const bottom = Math.max(
    original.y + original.height,
    padded.y + padded.height,
  );
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function isUsableBounds(bounds: TikzSvgBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}
