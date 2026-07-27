import { finishRenderMath, loadMathJax, loadPdfJs, renderMath } from "obsidian";
import type { TikzRenderArtifact } from "./types";
import {
  centerTikzMathInk,
  mapTikzOverlayPoint,
  placeTikzOverlay,
  type TikzOverlayPlacement,
} from "./overlayPosition";
import {
  EMPTY_TIKZ_FONT_PREFERENCES,
  tikzCssFontFamily,
  type TikzFontPreferences,
} from "./fonts";
import {
  TIKZ_DISPLAY_SCALE,
  tikzSvgCssScale,
} from "./displayMetrics";
import { isSafeSvgAttributeValue } from "./svgSecurity";

const overlayObservers = new WeakMap<HTMLElement, ResizeObserver>();
const SAFE_SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "clippath",
  "mask",
  "marker",
  "pattern",
  "lineargradient",
  "radialgradient",
  "stop",
]);
const SAFE_SVG_ATTRIBUTES = new Set([
  "xmlns",
  "xmlns:xlink",
  "id",
  "class",
  "role",
  "width",
  "height",
  "viewbox",
  "preserveaspectratio",
  "shape-rendering",
  "vector-effect",
  "transform",
  "d",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "points",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "opacity",
  "clip-path",
  "clip-rule",
  "mask",
  "markerunits",
  "markerwidth",
  "markerheight",
  "refx",
  "refy",
  "orient",
  "marker-start",
  "marker-mid",
  "marker-end",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "offset",
  "stop-color",
  "stop-opacity",
  "patternunits",
  "patterncontentunits",
  "patterntransform",
  "text-anchor",
  "dominant-baseline",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "style",
  "href",
  "xlink:href",
]);

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfRenderTask {
  promise: Promise<void>;
}

interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): PdfRenderTask;
  cleanup(): void;
}

interface PdfDocument {
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
}

interface PdfJs {
  getDocument(options: { data: Uint8Array }): PdfLoadingTask;
}

export async function renderTikzArtifact(
  artifact: TikzRenderArtifact,
  containerEl: HTMLElement,
  fonts: TikzFontPreferences = EMPTY_TIKZ_FONT_PREFERENCES,
  locale = "",
  accessibleName = "",
): Promise<void> {
  overlayObservers.get(containerEl)?.disconnect();
  overlayObservers.delete(containerEl);
  containerEl.removeClass("has-math-overlays");
  containerEl.removeAttribute("role");
  containerEl.removeAttribute("aria-label");
  if (artifact.mediaType === "image/svg+xml") {
    const svg = parseSafeSvg(artifact.bytes, containerEl.ownerDocument);
    svg.setAttribute("role", "img");
    if (
      accessibleName &&
      !svg.hasAttribute("aria-label") &&
      !svg.querySelector("title")
    ) {
      svg.setAttribute("aria-label", accessibleName);
    }
    containerEl.replaceChildren(svg);
    normalizeSvgBounds(svg);
    await renderSvgMathOverlays(svg, containerEl, fonts, locale);
    normalizeSvgBounds(svg);
    scheduleConnectedSvgBounds(svg, containerEl.ownerDocument);
    return;
  }
  if (accessibleName) {
    containerEl.setAttribute("role", "img");
    containerEl.setAttribute("aria-label", accessibleName);
  }
  await renderPdf(artifact.bytes, containerEl);
}

function parseSafeSvg(bytes: Uint8Array, ownerDocument: Document): SVGSVGElement {
  const parser = new (ownerDocument.defaultView?.DOMParser ?? DOMParser)();
  const parsed = parser.parseFromString(
    new TextDecoder().decode(bytes),
    "image/svg+xml",
  );
  const root = parsed.documentElement;
  if (root.localName !== "svg" || root.querySelector("parsererror")) {
    throw new Error("The LaTeX engine returned an invalid SVG.");
  }
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");

  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (!SAFE_SVG_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove();
    }
  }

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        (!SAFE_SVG_ATTRIBUTES.has(name) &&
          !name.startsWith("aria-") &&
          !name.startsWith("data-chord-")) ||
        name.startsWith("on") ||
        !isSafeSvgAttributeValue(name, value)
      ) {
        element.removeAttribute(attribute.name);
      } else if (
        (name === "fill" || name === "stroke" || name === "color") &&
        /^(?:#000(?:000)?|black)$/i.test(value)
      ) {
        element.setAttribute(attribute.name, "currentColor");
      } else if (
        (name === "fill" || name === "stroke" || name === "color") &&
        /^(?:#fff(?:fff)?|white)$/i.test(value)
      ) {
        element.setAttribute(attribute.name, "var(--background-primary)");
      }
    }
  }

  ensureSvgContentGroup(root);
  return ownerDocument.importNode(root, true) as unknown as SVGSVGElement;
}

function ensureSvgContentGroup(root: Element): void {
  if (root.querySelector('g[data-chord-tikz-content="true"]')) return;
  const group = root.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  group.setAttribute("data-chord-tikz-content", "true");
  for (const child of Array.from(root.children)) {
    if (["defs", "title", "desc"].includes(child.localName.toLowerCase())) {
      continue;
    }
    group.appendChild(child);
  }
  root.appendChild(group);
}

function normalizeSvgBounds(svg: SVGSVGElement): boolean {
  try {
    const content = svg.querySelector<SVGGElement>(
      'g[data-chord-tikz-content="true"]',
    );
    if (!content || !svg.isConnected) return false;
    const bounds = content.getBBox();
    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    ) {
      return false;
    }
    const currentViewBox = svg.viewBox.baseVal;
    const displayScale = tikzSvgCssScale(
      svg.getAttribute("width") ?? "",
      currentViewBox.width,
      svg.hasAttribute("data-chord-display-scale"),
    );
    const padding = 1;
    const x = bounds.x - padding;
    const y = bounds.y - padding;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;
    svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
    svg.setAttribute("width", `${width * displayScale}px`);
    svg.setAttribute("height", `${height * displayScale}px`);
    return true;
  } catch {
    return false;
  }
}

function scheduleConnectedSvgBounds(
  svg: SVGSVGElement,
  ownerDocument: Document,
): void {
  const requestFrame = ownerDocument.defaultView?.requestAnimationFrame;
  if (!requestFrame) return;
  let attempts = 0;
  const update = (): void => {
    if (normalizeSvgBounds(svg)) return;
    if (attempts++ < 60) {
      requestFrame.call(ownerDocument.defaultView, update);
    }
  };
  requestFrame.call(ownerDocument.defaultView, update);
}

async function renderSvgMathOverlays(
  svg: SVGSVGElement,
  containerEl: HTMLElement,
  fonts: TikzFontPreferences,
  locale: string,
): Promise<void> {
  const anchors = Array.from(
    svg.querySelectorAll<SVGTextElement>(
      "text[data-chord-math], text[data-chord-text]",
    ),
  );
  if (anchors.length === 0) return;

  try {
    await loadMathJax();
  } catch {
    return;
  }

  const overlays: Array<{
    element: HTMLElement;
    fontSize: number;
    width: number;
    x: number;
    y: number;
    alignMathInk: boolean;
    placement: TikzOverlayPlacement | null;
    anchorX: number;
    anchorY: number;
    gap: number;
    backgroundPadding: number | null;
    anchor: SVGTextElement;
  }> = [];
  for (const anchor of anchors) {
    const mathSource = anchor.dataset.chordMath;
    const textSource = anchor.dataset.chordText;
    const source = mathSource ?? textSource;
    const fontSize = Number(anchor.dataset.chordFontSize);
    const width = Number(anchor.dataset.chordWidth);
    const rawX = Number(anchor.dataset.chordX);
    const rawY = Number(anchor.dataset.chordY);
    const placement = parseTikzOverlayPlacement(
      anchor.dataset.chordPlacement,
    );
    const anchorX = Number(anchor.dataset.chordAnchorX);
    const anchorY = Number(anchor.dataset.chordAnchorY);
    const gap = Number(anchor.dataset.chordGap);
    const backgroundPadding =
      anchor.dataset.chordBackground === "true"
        ? Number(anchor.dataset.chordPadding)
        : null;
    const x = Number.isFinite(rawX) ? rawX : width / 2;
    const y = Number.isFinite(rawY) ? rawY : -2;
    if (!source || !Number.isFinite(fontSize) || !Number.isFinite(width)) {
      continue;
    }
    try {
      const element =
        mathSource !== undefined
          ? renderMathLabel(source, containerEl.ownerDocument)
          : renderMixedLabel(source, containerEl.ownerDocument);
      element.addClass("obsidian-math-chords-tikz-math-overlay");
      if (textSource !== undefined) {
        element.style.fontFamily = tikzCssFontFamily(
          textSource,
          fonts,
          locale,
        );
      }
      if (anchor.dataset.chordFontWeight) {
        element.style.fontWeight = anchor.dataset.chordFontWeight;
      }
      if (backgroundPadding !== null) {
        element.addClass("has-node-background");
      }
      containerEl.appendChild(element);
      overlays.push({
        element,
        fontSize,
        width,
        x,
        y,
        alignMathInk: mathSource !== undefined,
        placement,
        anchorX,
        anchorY,
        gap,
        backgroundPadding,
        anchor,
      });
    } catch {
      // Keep the WASM text fallback visible when MathJax rejects a formula.
    }
  }
  if (overlays.length === 0) return;

  await finishRenderMath();
  normalizeSvgBounds(svg);
  for (const { anchor, backgroundPadding } of overlays) {
    anchor.setAttribute("visibility", "hidden");
    if (backgroundPadding !== null) {
      const background = anchor.previousElementSibling;
      if (background?.matches('[data-chord-node-background="true"]')) {
        background.setAttribute("visibility", "hidden");
      }
    }
  }
  containerEl.addClass("has-math-overlays");

  const position = (): void => {
    if (!containerEl.isConnected) {
      overlayObservers.get(containerEl)?.disconnect();
      overlayObservers.delete(containerEl);
      return;
    }
    const containerRect = containerEl.getBoundingClientRect();
    for (const {
      element,
      fontSize,
      x,
      y,
      alignMathInk,
      placement,
      anchorX,
      anchorY,
      gap,
      backgroundPadding,
      anchor,
    } of overlays) {
      const matrix = anchor.getScreenCTM();
      if (!matrix) continue;
      let point = mapTikzOverlayPoint(
        matrix,
        x,
        y,
        containerRect.left,
        containerRect.top,
      );
      element.style.fontSize = `${fontSize * Math.hypot(matrix.a, matrix.b)}px`;
      if (
        backgroundPadding !== null &&
        Number.isFinite(backgroundPadding)
      ) {
        element.style.padding =
          `${backgroundPadding * Math.hypot(matrix.a, matrix.b)}px`;
      }
      const ink = alignMathInk
        ? element.querySelector<HTMLElement>(
            "mjx-math, mjx-container > svg",
          )
        : null;
      const visibleRect = ink?.getBoundingClientRect()
        ?? element.getBoundingClientRect();
      if (
        placement &&
        Number.isFinite(anchorX) &&
        Number.isFinite(anchorY) &&
        Number.isFinite(gap)
      ) {
        const anchorPoint = mapTikzOverlayPoint(
          matrix,
          anchorX,
          anchorY,
          containerRect.left,
          containerRect.top,
        );
        point = placeTikzOverlay(
          anchorPoint,
          placement,
          visibleRect.width,
          visibleRect.height,
          gap * Math.hypot(matrix.a, matrix.b),
          gap * Math.hypot(matrix.c, matrix.d),
        );
      }
      const correction = ink
        ? centerTikzMathInk(
            element.getBoundingClientRect(),
            ink.getBoundingClientRect(),
          )
        : { x: 0, y: 0 };
      element.style.left = `${point.left + correction.x}px`;
      element.style.top = `${point.top + correction.y}px`;
    }
  };

  position();
  const ResizeObserverCtor = containerEl.ownerDocument.defaultView?.ResizeObserver;
  if (ResizeObserverCtor) {
    const observer = new ResizeObserverCtor(position);
    observer.observe(svg);
    observer.observe(containerEl);
    overlayObservers.set(containerEl, observer);
  }
}

function parseTikzOverlayPlacement(
  value: string | undefined,
): TikzOverlayPlacement | null {
  switch (value) {
    case "above":
    case "below":
    case "left":
    case "right":
    case "above-left":
    case "above-right":
    case "below-left":
    case "below-right":
      return value;
    default:
      return null;
  }
}

function renderMathLabel(source: string, ownerDocument: Document): HTMLElement {
  const element = ownerDocument.createElement("span");
  element.addClass("is-math-only");
  element.appendChild(renderMath(source, false));
  return element;
}

function renderMixedLabel(source: string, ownerDocument: Document): HTMLElement {
  const element = ownerDocument.createElement("span");
  element.addClass("is-mixed-label");
  let cursor = 0;
  for (const match of source.matchAll(/\$([^$]+)\$/g)) {
    const index = match.index;
    if (index > cursor) {
      appendMixedText(element, source.slice(cursor, index), ownerDocument);
    }
    element.appendChild(renderMath(match[1], false));
    cursor = index + match[0].length;
  }
  if (cursor < source.length) {
    appendMixedText(element, source.slice(cursor), ownerDocument);
  }
  return element;
}

function appendMixedText(
  element: HTMLElement,
  source: string,
  ownerDocument: Document,
): void {
  const lines = source.split(String.raw`\\`);
  lines.forEach((line, index) => {
    if (index > 0) element.appendChild(ownerDocument.createElement("br"));
    if (line) element.appendChild(ownerDocument.createTextNode(line));
  });
}

async function renderPdf(
  bytes: Uint8Array,
  containerEl: HTMLElement,
): Promise<void> {
  const pdfjs = (await loadPdfJs()) as PdfJs;
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  try {
      const page = await pdf.getPage(1);
    try {
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = availableRenderWidth(containerEl);
      const cssScale = Math.min(
        TIKZ_DISPLAY_SCALE,
        availableWidth / baseViewport.width,
      );
      const pixelRatio = Math.min(
        containerEl.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        2,
      );
      const viewport = page.getViewport({ scale: cssScale * pixelRatio });
      const canvas = containerEl.ownerDocument.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / pixelRatio)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / pixelRatio)}px`;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Could not create a PDF preview canvas.");
      await page.render({ canvasContext: context, viewport }).promise;
      containerEl.replaceChildren(canvas);
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}

function availableRenderWidth(element: HTMLElement): number {
  let candidate: HTMLElement | null = element;
  while (candidate) {
    if (candidate.clientWidth > 0) return candidate.clientWidth;
    candidate = candidate.parentElement;
  }
  return 640;
}
