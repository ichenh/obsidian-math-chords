export function pdfToSvgArguments(
  pdfPath: string,
  svgPath: string,
): string[] {
  return [
    "--pdf",
    "--no-fonts",
    "--precision=6",
    `--output=${svgPath}`,
    pdfPath,
  ];
}
