import type { TikzRenderArtifact } from "./types";
import {
  getDesktopFileSystem,
  getDesktopSaveDialog,
} from "./desktopNode";

export type TikzExportFormat = "svg" | "png" | "jpg" | "pdf";

export interface TikzExportRequest {
  artifact: TikzRenderArtifact;
  outputEl: HTMLElement;
}

interface ExportFile {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
}

interface ExportTarget {
  format: TikzExportFormat;
  write(file: ExportFile): Promise<void>;
}

export async function exportTikzPreview(
  request: TikzExportRequest,
): Promise<void> {
  const target = await chooseExportTarget(request.outputEl.ownerDocument);
  if (!target) return;
  const file = await createExportFile(request, target.format);
  await target.write(file);
}

async function createExportFile(
  request: TikzExportRequest,
  format: TikzExportFormat,
): Promise<ExportFile> {
  if (
    format === "pdf" &&
    request.artifact.mediaType === "application/pdf"
  ) {
    return {
      bytes: request.artifact.bytes.slice(),
      mimeType: "application/pdf",
      extension: "pdf",
    };
  }

  const snapshot = createSvgSnapshot(request.outputEl);
  if (format === "svg") {
    return {
      bytes: new TextEncoder().encode(snapshot.source),
      mimeType: "image/svg+xml",
      extension: "svg",
    };
  }

  const raster = await rasterizeSvg(
    snapshot.source,
    snapshot.width,
    snapshot.height,
    format === "png" ? "image/png" : "image/jpeg",
    request.outputEl.ownerDocument,
  );
  if (format === "pdf") {
    return {
      bytes: createSingleImagePdf(
        raster.bytes,
        raster.width,
        raster.height,
      ),
      mimeType: "application/pdf",
      extension: "pdf",
    };
  }
  return {
    bytes: raster.bytes,
    mimeType: format === "png" ? "image/png" : "image/jpeg",
    extension: format,
  };
}

function createSvgSnapshot(outputEl: HTMLElement): {
  source: string;
  width: number;
  height: number;
} {
  const ownerDocument = outputEl.ownerDocument;
  const svgNamespace = "http://www.w3.org/2000/svg";
  const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
  const renderedSvg = outputEl.querySelector<SVGSVGElement>("svg");
  const renderedCanvas = outputEl.querySelector<HTMLCanvasElement>("canvas");
  let root: SVGSVGElement;
  let width: number;
  let height: number;
  if (renderedSvg) {
    root = renderedSvg.cloneNode(true) as SVGSVGElement;
    const viewBox = renderedSvg.viewBox.baseVal;
    width = Math.max(1, viewBox.width || renderedSvg.clientWidth);
    height = Math.max(1, viewBox.height || renderedSvg.clientHeight);
    root.setAttribute("width", String(width));
    root.setAttribute("height", String(height));
    if (!root.hasAttribute("viewBox")) {
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  } else if (renderedCanvas) {
    width = Math.max(1, renderedCanvas.width);
    height = Math.max(1, renderedCanvas.height);
    root = ownerDocument.createElementNS(svgNamespace, "svg");
    root.setAttribute("width", String(width));
    root.setAttribute("height", String(height));
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const image = ownerDocument.createElementNS(svgNamespace, "image");
    image.setAttribute("width", String(width));
    image.setAttribute("height", String(height));
    image.setAttribute("href", renderedCanvas.toDataURL("image/png"));
    root.appendChild(image);
  } else {
    throw new Error("There is no rendered TikZ image to export.");
  }
  root.setAttribute("xmlns", svgNamespace);
  root.setAttribute("xmlns:xhtml", xhtmlNamespace);

  if (renderedSvg) for (const overlay of Array.from(
    outputEl.querySelectorAll<HTMLElement>(
      ".obsidian-math-chords-tikz-math-overlay",
    ),
  )) {
    const bounds = overlayBoundsInSvg(overlay, renderedSvg);
    if (!bounds) continue;
    const foreignObject = ownerDocument.createElementNS(
      svgNamespace,
      "foreignObject",
    );
    foreignObject.setAttribute("x", String(bounds.x));
    foreignObject.setAttribute("y", String(bounds.y));
    foreignObject.setAttribute("width", String(bounds.width));
    foreignObject.setAttribute("height", String(bounds.height));
    const wrapper = ownerDocument.createElementNS(xhtmlNamespace, "div");
    const clone = overlay.cloneNode(true) as HTMLElement;
    const computed = ownerDocument.defaultView?.getComputedStyle(overlay);
    const exportedStyles = [
      "position:static",
      "transform:none",
      "margin:0",
    ];
    if (computed) {
      exportedStyles.push(
        `color:${computed.color}`,
        `font-family:${computed.fontFamily}`,
        `font-size:${computed.fontSize}`,
        `line-height:${computed.lineHeight}`,
      );
    }
    clone.setAttribute(
      "style",
      `${clone.getAttribute("style") ?? ""};${exportedStyles.join(";")}`,
    );
    wrapper.appendChild(clone);
    foreignObject.appendChild(wrapper);
    root.appendChild(foreignObject);
  }

  return {
    source: new (
      ownerDocument.defaultView?.XMLSerializer ?? XMLSerializer
    )().serializeToString(root),
    width,
    height,
  };
}

async function rasterizeSvg(
  source: string,
  width: number,
  height: number,
  mimeType: "image/png" | "image/jpeg",
  ownerDocument: Document,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const scale = Math.min(3, Math.max(1, 2400 / Math.max(width, height)));
  const pixelWidth = Math.max(1, Math.round(width * scale));
  const pixelHeight = Math.max(1, Math.round(height * scale));
  const canvas = ownerDocument.body.createEl("canvas");
  canvas.detach();
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an export canvas.");
  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pixelWidth, pixelHeight);
  }

  const win = ownerDocument.defaultView;
  const BlobCtor = win?.Blob ?? Blob;
  const UrlCtor = win?.URL ?? URL;
  const blob = new BlobCtor([source], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = UrlCtor.createObjectURL(blob);
  try {
    const image = await loadImage(url, ownerDocument);
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  } finally {
    UrlCtor.revokeObjectURL(url);
  }
  const output = await canvasBlob(
    canvas,
    mimeType,
    mimeType === "image/jpeg" ? 0.95 : undefined,
  );
  return {
    bytes: new Uint8Array(await output.arrayBuffer()),
    width: pixelWidth,
    height: pixelHeight,
  };
}

function loadImage(
  url: string,
  ownerDocument: Document,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const ImageCtor = ownerDocument.defaultView?.Image ?? Image;
    const image = new ImageCtor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize the TikZ preview."));
    image.src = url;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not encode the exported image.")),
      mimeType,
      quality,
    );
  });
}

async function chooseExportTarget(
  ownerDocument: Document,
): Promise<ExportTarget | null> {
  const options = {
    title: "Export TikZ",
    defaultPath: "tikz.svg",
    filters: [
      { name: "SVG", extensions: ["svg"] },
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
      { name: "PDF", extensions: ["pdf"] },
    ],
  };
  const desktopDialog = getDesktopSaveDialog(ownerDocument.defaultView);
  if (desktopDialog) {
    const result = await desktopDialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    return localFileTarget(result.filePath);
  }

  const win = ownerDocument.defaultView as unknown as {
    showSaveFilePicker?: (options: unknown) => Promise<{
      name: string;
      createWritable(): Promise<{
        write(data: Uint8Array): Promise<void>;
        close(): Promise<void>;
      }>;
    }>;
  } | null;
  if (win?.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: "tikz.svg",
        types: [
          { description: "SVG", accept: { "image/svg+xml": [".svg"] } },
          { description: "PNG", accept: { "image/png": [".png"] } },
          { description: "JPEG", accept: { "image/jpeg": [".jpg", ".jpeg"] } },
          { description: "PDF", accept: { "application/pdf": [".pdf"] } },
        ],
      });
      const format = exportFormatFromFilename(handle.name);
      return {
        format,
        write: async (file) => {
          const writable = await handle.createWritable();
          await writable.write(file.bytes);
          await writable.close();
        },
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        return null;
      }
      throw error;
    }
  }
  throw new Error("Could not open a desktop save dialog.");
}

function localFileTarget(path: string): ExportTarget {
  const format = exportFormatFromFilename(path);
  return {
    format,
    write: (file) => writeLocalFile(path, file.bytes),
  };
}

export function exportFormatFromFilename(
  filename: string,
): TikzExportFormat {
  const match = filename.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match?.[1];
  if (extension === "svg" || extension === "png" || extension === "pdf") {
    return extension;
  }
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  throw new Error(
    "Use a .svg, .png, .jpg, .jpeg, or .pdf filename extension.",
  );
}

async function writeLocalFile(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const fs = getDesktopFileSystem();
  await fs.writeFile(path, bytes);
}

function overlayBoundsInSvg(
  overlay: HTMLElement,
  svg: SVGSVGElement,
): { x: number; y: number; width: number; height: number } | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const inverse = matrix.inverse();
  const rect = overlay.getBoundingClientRect();
  const topLeft = svg.createSVGPoint();
  topLeft.x = rect.left;
  topLeft.y = rect.top;
  const bottomRight = svg.createSVGPoint();
  bottomRight.x = rect.right;
  bottomRight.y = rect.bottom;
  const first = topLeft.matrixTransform(inverse);
  const second = bottomRight.matrixTransform(inverse);
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.max(1, Math.abs(second.x - first.x)),
    height: Math.max(1, Math.abs(second.y - first.y)),
  };
}

export function createSingleImagePdf(
  jpegBytes: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
): Uint8Array {
  const pageWidth = Math.max(1, pixelWidth * 0.75);
  const pageHeight = Math.max(1, pixelHeight * 0.75);
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const append = (value: string | Uint8Array): void => {
    const bytes =
      typeof value === "string" ? new TextEncoder().encode(value) : value;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (
    number: number,
    header: string,
    stream?: Uint8Array,
  ): void => {
    offsets[number] = length;
    append(`${number} 0 obj\n${header}`);
    if (stream) {
      append("\nstream\n");
      append(stream);
      append("\nendstream");
    }
    append("\nendobj\n");
  };

  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`,
    jpegBytes,
  );
  const contentBytes = new TextEncoder().encode(content);
  object(5, `<< /Length ${contentBytes.length} >>`, contentBytes);

  const xref = length;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let index = 1; index <= 5; index++) {
    append(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const output = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}
