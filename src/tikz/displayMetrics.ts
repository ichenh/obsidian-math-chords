export const TIKZ_DISPLAY_SCALE = 1.5;

const CSS_PIXELS_PER_INCH = 96;
const MAX_PDF_RASTER_PIXELS = 16_000_000;
const MAX_PDF_RASTER_DIMENSION = 8_192;

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

export function tikzPdfPixelRatio(
  width: number,
  height: number,
  cssScale: number,
  devicePixelRatio: number,
  printRender: boolean,
): number {
  const safeWidth = Math.max(1, width * cssScale);
  const safeHeight = Math.max(1, height * cssScale);
  const target = Math.max(
    Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1,
    printRender ? 4 : 2,
  );
  const dimensionLimit =
    MAX_PDF_RASTER_DIMENSION / Math.max(safeWidth, safeHeight);
  const pixelLimit = Math.sqrt(
    MAX_PDF_RASTER_PIXELS / (safeWidth * safeHeight),
  ) * (1 - 1e-12);
  return Math.max(
    Number.EPSILON,
    Math.min(target, dimensionLimit, pixelLimit),
  );
}
