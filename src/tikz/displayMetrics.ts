export const TIKZ_DISPLAY_SCALE = 1.5;

const CSS_PIXELS_PER_INCH = 96;

export function svgLengthToCssPixels(value: string): number | null {
  const match =
    /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(px|pt|pc|in|cm|mm)?\s*$/i.exec(
      value,
    );
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "px":
      return amount;
    case "pt":
      return amount * CSS_PIXELS_PER_INCH / 72;
    case "pc":
      return amount * CSS_PIXELS_PER_INCH / 6;
    case "in":
      return amount * CSS_PIXELS_PER_INCH;
    case "cm":
      return amount * CSS_PIXELS_PER_INCH / 2.54;
    case "mm":
      return amount * CSS_PIXELS_PER_INCH / 25.4;
    default:
      return null;
  }
}

export function tikzSvgCssScale(
  declaredWidth: string,
  viewBoxWidth: number,
  displayScaleApplied: boolean,
): number {
  const cssWidth = svgLengthToCssPixels(declaredWidth);
  const intrinsicScale =
    cssWidth !== null && viewBoxWidth > 0
      ? cssWidth / viewBoxWidth
      : 1;
  return displayScaleApplied
    ? intrinsicScale
    : intrinsicScale * TIKZ_DISPLAY_SCALE;
}
