export interface TikzExportMatrix {
  a: number;
  b: number;
}

export interface TikzExportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function tikzExportOverlayScale(
  matrix: TikzExportMatrix,
): number {
  const screenUnitsPerSvgUnit = Math.hypot(matrix.a, matrix.b);
  return Number.isFinite(screenUnitsPerSvgUnit) &&
    screenUnitsPerSvgUnit > Number.EPSILON
    ? 1 / screenUnitsPerSvgUnit
    : 1;
}

export function unionTikzExportBounds(
  first: TikzExportBounds,
  second: TikzExportBounds,
): TikzExportBounds {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  const right = Math.max(
    first.x + first.width,
    second.x + second.width,
  );
  const bottom = Math.max(
    first.y + first.height,
    second.y + second.height,
  );
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}
