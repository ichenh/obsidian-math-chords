const SVG_LOCAL_PAINT_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "color",
  "stop-color",
]);

export function isSafeSvgAttributeValue(name: string, value: string): boolean {
  const normalizedName = name.toLowerCase();
  const normalizedValue = value.trim();
  const isLocalReference = /^url\(\s*["']?#[a-z0-9_.:-]+["']?\s*\)$/i.test(
    normalizedValue,
  );
  if (normalizedName === "href" || normalizedName === "xlink:href") {
    return normalizedValue === "" || normalizedValue.startsWith("#");
  }
  if (normalizedName === "style") {
    return !(
      /@import\b|expression\s*\(|(?:javascript|data)\s*:/i.test(
        normalizedValue,
      ) || /url\s*\(\s*(?!['"]?#)/i.test(normalizedValue)
    );
  }
  if (
    SVG_LOCAL_PAINT_ATTRIBUTES.has(normalizedName) &&
    /url\s*\(/i.test(normalizedValue)
  ) {
    return isLocalReference;
  }
  if (
    normalizedName === "clip-path" ||
    normalizedName === "mask" ||
    normalizedName.startsWith("marker-")
  ) {
    return normalizedValue === "none" || isLocalReference;
  }
  return true;
}
