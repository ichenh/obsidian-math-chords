import { finishRenderMath, loadMathJax, loadPdfJs, renderMath } from "obsidian";
import type { TikzRenderArtifact } from "./types";
import {
  centerTikzMathInk,
  placeTikzOverlay,
  tikzEmbeddedOverlayBounds,
  type TikzOverlayPlacement,
} from "./overlayPosition";
import {
  EMPTY_TIKZ_FONT_PREFERENCES,
  tikzCssFontFamily,
  type TikzFontPreferences,
} from "./fonts";
import {
  TIKZ_DISPLAY_SCALE,
  tikzPdfPixelRatio,
  tikzSvgCssScale,
} from "./displayMetrics";
import { isSafeSvgAttributeValue } from "./svgSecurity";
import { unionTikzSvgBounds } from "./svgGeometry";
import { namespaceTikzSvgIds } from "./svgInstances";

let svgInstanceId = 0;
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
  "color",
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

  namespaceTikzSvgIds(root, `chord-tikz-${++svgInstanceId}-`);
  ensureSvgContentGroup(root);
  return ownerDocument.importNode(root, true) as unknown as SVGSVGElement;
}

function ensureSvgContentGroup(root: Element): void {
  if (root.querySelector('g[data-chord-tikz-content="true"]')) return;
  const children = Array.from(root.children);
  const group = root.createSvg("g");
  group.setAttribute("data-chord-tikz-content", "true");
  for (const child of children) {
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
    const visualBounds = unionTikzSvgBounds(
      {
        x: currentViewBox.x,
        y: currentViewBox.y,
        width: currentViewBox.width,
        height: currentViewBox.height,
      },
      bounds,
      1,
    );
    const { x, y, width, height } = visualBounds;
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

  const measurementEl = containerEl.ownerDocument.body.createDiv({
    cls: "obsidian-math-chords-tikz-overlay-measurement",
  });
  measurementEl.setCssProps({
    position: "fixed",
    top: "0",
    left: "-100000px",
    visibility: "hidden",
    pointerEvents: "none",
  });
  const overlays: Array<{
    element: HTMLElement;
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
      element.setCssProps({
        position: "static",
        left: "auto",
        top: "auto",
        transform: "none",
        margin: "0",
        color: "var(--text-normal)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      });
      if (mathSource !== undefined) {
        element.setCssProps({
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: "1",
        });
      } else {
        element.setCssProps({
          display: "inline-block",
          lineHeight: "1.15",
        });
      }
      element.style.fontSize = `${fontSize}px`;
      if (
        backgroundPadding !== null &&
        Number.isFinite(backgroundPadding)
      ) {
        element.style.padding = `${backgroundPadding}px`;
      }
      measurementEl.appendChild(element);
      overlays.push({
        element,
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
  if (overlays.length === 0) {
    measurementEl.remove();
    return;
  }

  try {
    await finishRenderMath();
    const content = svg.querySelector<SVGGElement>(
      'g[data-chord-tikz-content="true"]',
    );
    if (!content) return;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
    for (const {
      element,
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
      const ink = alignMathInk
        ? element.querySelector<HTMLElement>(
            "mjx-math, mjx-container > svg",
          )
        : null;
      const elementRect = element.getBoundingClientRect();
      const visibleRect = ink?.getBoundingClientRect() ?? elementRect;
      let point = { left: x, top: y };
      if (
        placement &&
        Number.isFinite(anchorX) &&
        Number.isFinite(anchorY) &&
        Number.isFinite(gap)
      ) {
        point = placeTikzOverlay(
          { left: anchorX, top: anchorY },
          placement,
          visibleRect.width,
          visibleRect.height,
          backgroundPadding === null ? gap : 0,
          backgroundPadding === null ? gap : 0,
        );
      }
      const correction = ink
        ? centerTikzMathInk(
            elementRect,
            ink.getBoundingClientRect(),
          )
        : { x: 0, y: 0 };
      const width = Math.max(1, elementRect.width);
      const height = Math.max(1, elementRect.height);
      const bounds = tikzEmbeddedOverlayBounds(
        point,
        correction,
        width,
        height,
      );
      const foreignObject = containerEl.ownerDocument.createElementNS(
        svgNamespace,
        "foreignObject",
      );
      foreignObject.setAttribute("x", String(bounds.x));
      foreignObject.setAttribute("y", String(bounds.y));
      foreignObject.setAttribute("width", String(bounds.width));
      foreignObject.setAttribute("height", String(bounds.height));
      const wrapper = containerEl.ownerDocument.createElementNS(
        xhtmlNamespace,
        "div",
      );
      wrapper.setCssProps({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        overflow: "visible",
      });
      wrapper.appendChild(element);
      foreignObject.appendChild(wrapper);
      content.appendChild(foreignObject);
      anchor.setAttribute("visibility", "hidden");
      if (backgroundPadding !== null) {
        const background = anchor.previousElementSibling;
        if (background?.matches('[data-chord-node-background="true"]')) {
          background.setAttribute("visibility", "hidden");
        }
      }
    }
    normalizeSvgBounds(svg);
  } finally {
    measurementEl.remove();
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
  const element = ownerDocument.body.createSpan();
  element.detach();
  element.addClass("is-math-only");
  element.appendChild(renderMath(source, false));
  return element;
}

function renderMixedLabel(source: string, ownerDocument: Document): HTMLElement {
  const element = ownerDocument.body.createSpan();
  element.detach();
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
    if (index > 0) element.createEl("br");
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
      const pixelRatio = tikzPdfPixelRatio(
        baseViewport.width,
        baseViewport.height,
        cssScale,
        containerEl.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        containerEl.closest(".print") !== null,
      );
      const viewport = page.getViewport({ scale: cssScale * pixelRatio });
      const canvas = containerEl.createEl("canvas");
      canvas.detach();
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
