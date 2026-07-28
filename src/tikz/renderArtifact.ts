import { finishRenderMath, loadMathJax, loadPdfJs, renderMath } from "obsidian";
import type { TikzRenderArtifact } from "./types";
import {
  fitTikzNodeBox,
  placeTikzAnchoredNode,
  placeTikzOverlay,
  tikzEmbeddedOverlayBounds,
  type TikzNodeAnchor,
  type TikzOverlayPlacement,
} from "./overlayPosition";
import {
  detectTikzTextProfile,
  EMPTY_TIKZ_FONT_PREFERENCES,
  normalizeTikzFontName,
  tikzCssFontFamily,
  type TikzFontPreferences,
} from "./fonts";
import { hyphenateEnglishTikzText } from "./hyphenation";
import {
  TIKZ_DISPLAY_SCALE,
  tikzPdfPixelRatio,
  tikzSvgCssScale,
} from "./displayMetrics";
import { isSafeSvgAttributeValue } from "./svgSecurity";
import { unionTikzSvgBounds } from "./svgGeometry";
import { namespaceTikzSvgIds } from "./svgInstances";

let svgInstanceId = 0;
let pendingTikzMathFinish: Promise<void> | null = null;
const tikzTexFontLoads = new WeakMap<
  Document,
  Map<string, Promise<void>>
>();
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

interface TikzMeasuredOverlay {
  element: HTMLElement;
  x: number;
  y: number;
  rotate: number;
  placement: TikzOverlayPlacement | null;
  nodeAnchor: TikzNodeAnchor | null;
  referenceX: number;
  referenceY: number;
  anchorX: number;
  anchorY: number;
  gap: number;
  textAlign: "left" | "center";
  anchor: SVGTextElement;
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
    normalizeSvgBounds(svg, true);
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

function normalizeSvgBounds(
  svg: SVGSVGElement,
  fitMeasuredContent = false,
): boolean {
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
    const visualBounds = fitMeasuredContent
      ? {
          x: bounds.x - 1,
          y: bounds.y - 1,
          width: bounds.width + 2,
          height: bounds.height + 2,
        }
      : unionTikzSvgBounds(
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
  const overlays: TikzMeasuredOverlay[] = [];
  for (const anchor of anchors) {
    const mathSource = anchor.dataset.chordMath;
    const textSource = anchor.dataset.chordText;
    const source = mathSource ?? textSource;
    const fontSize = Number(anchor.dataset.chordFontSize);
    const width = Number(anchor.dataset.chordWidth);
    const rawX = Number(anchor.dataset.chordX);
    const rawY = Number(anchor.dataset.chordY);
    const rawRotate = Number(anchor.dataset.chordRotate);
    const rotate = Number.isFinite(rawRotate) ? rawRotate : 0;
    const placement = parseTikzOverlayPlacement(
      anchor.dataset.chordPlacement,
    );
    const nodeAnchor = parseTikzNodeAnchor(anchor.dataset.chordNodeAnchor);
    const referenceX = Number(anchor.dataset.chordReferenceX);
    const referenceY = Number(anchor.dataset.chordReferenceY);
    const anchorX = Number(anchor.dataset.chordAnchorX);
    const anchorY = Number(anchor.dataset.chordAnchorY);
    const gap = Number(anchor.dataset.chordGap);
    const paddingX = Number(anchor.dataset.chordPaddingX);
    const paddingY = Number(anchor.dataset.chordPaddingY);
    const rawTextWidth = Number(anchor.dataset.chordTextWidth);
    const textWidth = Number.isFinite(rawTextWidth) ? rawTextWidth : null;
    const textAlign =
      anchor.dataset.chordAlign === "left" ? "left" : "center";
    const x = Number.isFinite(rawX) ? rawX : width / 2;
    const y = Number.isFinite(rawY) ? rawY : -2;
    if (!source || !Number.isFinite(fontSize) || !Number.isFinite(width)) {
      continue;
    }
    try {
      const textProfile =
        textSource === undefined
          ? null
          : detectTikzTextProfile(textSource, locale);
      const useEnglishHyphenation =
        textWidth !== null && textProfile === "latin";
      const element =
        mathSource !== undefined
          ? renderMathLabel(source, containerEl.ownerDocument)
          : renderMixedLabel(
              source,
              containerEl.ownerDocument,
              useEnglishHyphenation,
            );
      element.addClass("obsidian-math-chords-tikz-math-overlay");
      if (textSource !== undefined) {
        element.style.fontFamily = tikzCssFontFamily(
          textSource,
          fonts,
          locale,
        );
        if (
          textProfile === "latin" &&
          normalizeTikzFontName(fonts.latin) === ""
        ) {
          element.addClass("uses-tex-font");
        }
      }
      if (anchor.dataset.chordFontWeight) {
        element.style.fontWeight = anchor.dataset.chordFontWeight;
      }
      if (textWidth !== null) {
        element.addClass("has-text-width");
        element.setAttribute(
          "lang",
          useEnglishHyphenation && isAsciiText(textSource ?? "")
            ? "en-US"
            : locale || containerEl.ownerDocument.documentElement.lang,
        );
      }
      element.setCssProps({
        position: "static",
        left: "auto",
        top: "auto",
        transform: "none",
        margin: "0",
        color: "var(--text-normal)",
        backgroundColor: "transparent",
        pointerEvents: "none",
        whiteSpace: textWidth === null ? "nowrap" : "normal",
        textAlign,
        minWidth: "0",
        overflowWrap: textWidth === null ? "normal" : "break-word",
        wordBreak: "normal",
        hyphens: textWidth === null ? "manual" : "auto",
      });
      element.style.setProperty("text-align", textAlign, "important");
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
      if (Number.isFinite(paddingX) && Number.isFinite(paddingY)) {
        element.style.padding = `${paddingY}px ${paddingX}px`;
      }
      if (textWidth !== null) {
        element.style.width = `${textWidth}px`;
      }
      measurementEl.appendChild(element);
      overlays.push({
        element,
        x,
        y,
        rotate,
        placement,
        nodeAnchor,
        referenceX,
        referenceY,
        anchorX,
        anchorY,
        gap,
        textAlign,
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
    await finishTikzMathBatch();
    await ensureTikzTexFonts(containerEl.ownerDocument, overlays);
    const content = svg.querySelector<SVGGElement>(
      'g[data-chord-tikz-content="true"]',
    );
    if (!content) return;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
    const measuredOverlays = overlays.map((overlay) => ({
      ...overlay,
      elementRect: overlay.element.getBoundingClientRect(),
    }));
    for (const {
      element,
      x,
      y,
      rotate,
      placement,
      nodeAnchor,
      referenceX,
      referenceY,
      anchorX,
      anchorY,
      gap,
      textAlign,
      anchor,
      elementRect,
    } of measuredOverlays) {
      let point = { left: x, top: y };
      if (
        nodeAnchor &&
        Number.isFinite(referenceX) &&
        Number.isFinite(referenceY)
      ) {
        const radians = rotate * Math.PI / 180;
        const visualWidth =
          elementRect.width * Math.abs(Math.cos(radians)) +
          elementRect.height * Math.abs(Math.sin(radians));
        const visualHeight =
          elementRect.width * Math.abs(Math.sin(radians)) +
          elementRect.height * Math.abs(Math.cos(radians));
        point = placeTikzAnchoredNode(
          { left: referenceX, top: referenceY },
          nodeAnchor,
          visualWidth,
          visualHeight,
        );
      }
      if (
        placement &&
        Number.isFinite(anchorX) &&
        Number.isFinite(anchorY) &&
        Number.isFinite(gap)
      ) {
        point = placeTikzOverlay(
          { left: anchorX, top: anchorY },
          placement,
          elementRect.width,
          elementRect.height,
          gap,
          gap,
        );
      }
      const width = Math.max(1, elementRect.width);
      const height = Math.max(1, elementRect.height);
      fitNodeBackgroundToOverlay(
        anchor,
        point.left,
        point.top,
        width,
        height,
      );
      const bounds = tikzEmbeddedOverlayBounds(
        point,
        { x: 0, y: 0 },
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
      if (rotate !== 0) {
        foreignObject.setAttribute(
          "transform",
          `rotate(${-rotate} ${point.left} ${point.top})`,
        );
      }
      const wrapper = containerEl.ownerDocument.createElementNS(
        xhtmlNamespace,
        "div",
      );
      wrapper.setCssProps({
        display: "flex",
        alignItems: "center",
        justifyContent: textAlign === "left" ? "flex-start" : "center",
        width: "100%",
        height: "100%",
        overflow: "visible",
        backgroundColor: "transparent",
      });
      wrapper.appendChild(element);
      foreignObject.appendChild(wrapper);
      content.appendChild(foreignObject);
      anchor.remove();
    }
  } finally {
    measurementEl.remove();
  }
}

function finishTikzMathBatch(): Promise<void> {
  if (pendingTikzMathFinish) return pendingTikzMathFinish;
  const task = Promise.resolve()
    .then(() => finishRenderMath())
    .finally(() => {
      if (pendingTikzMathFinish === task) pendingTikzMathFinish = null;
    });
  pendingTikzMathFinish = task;
  return task;
}

async function ensureTikzTexFonts(
  ownerDocument: Document,
  overlays: readonly TikzMeasuredOverlay[],
): Promise<void> {
  const faces = new Set<string>();
  for (const { element } of overlays) {
    if (!element.hasClass("uses-tex-font")) continue;
    faces.add("MJXTEX");
    if (element.querySelector("strong")) faces.add("MJXTEX-B");
    if (element.querySelector("em")) faces.add("MJXTEX-I");
    if (element.querySelector("strong em, em strong")) faces.add("MJXTEX-BI");
  }
  if (faces.size === 0) return;

  let loads = tikzTexFontLoads.get(ownerDocument);
  if (!loads) {
    loads = new Map();
    tikzTexFontLoads.set(ownerDocument, loads);
  }
  const pending: Promise<void>[] = [];
  for (const face of faces) {
    let load = loads.get(face);
    if (!load) {
      load = ownerDocument.fonts
        .load(`10px "${face}"`, "Math Chords")
        .then(() => undefined, () => undefined);
      loads.set(face, load);
    }
    pending.push(load);
  }
  await Promise.all(pending);
}

function fitNodeBackgroundToOverlay(
  anchor: SVGTextElement,
  centerX: number,
  centerY: number,
  contentWidth: number,
  contentHeight: number,
): void {
  const background = anchor.previousElementSibling;
  if (
    background?.localName.toLowerCase() !== "rect" ||
    background.getAttribute("data-chord-node-background") !== "true"
  ) {
    return;
  }
  const minimumWidth = Number(anchor.dataset.chordMinWidth);
  const minimumHeight = Number(anchor.dataset.chordMinHeight);
  if (!Number.isFinite(minimumWidth) || !Number.isFinite(minimumHeight)) return;
  const box = fitTikzNodeBox(
    { x: centerX, y: centerY },
    { width: minimumWidth, height: minimumHeight },
    { width: contentWidth, height: contentHeight },
  );
  background.setAttribute("x", String(box.x));
  background.setAttribute("y", String(box.y));
  background.setAttribute("width", String(box.width));
  background.setAttribute("height", String(box.height));
}

function parseTikzNodeAnchor(value: string | undefined): TikzNodeAnchor | null {
  switch (value) {
    case "center":
    case "north":
    case "south":
    case "east":
    case "west":
    case "north-east":
    case "north-west":
    case "south-east":
    case "south-west":
      return value;
    default:
      return null;
  }
}

function isAsciiText(source: string): boolean {
  return Array.from(source).every(
    (character) => (character.codePointAt(0) ?? 0) <= 0x7f,
  );
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

function renderMixedLabel(
  source: string,
  ownerDocument: Document,
  hyphenateEnglish: boolean,
): HTMLElement {
  const element = ownerDocument.body.createSpan();
  element.detach();
  element.addClass("is-mixed-label");
  appendMixedText(element, source, ownerDocument, hyphenateEnglish);
  return element;
}

function appendMixedText(
  element: HTMLElement,
  source: string,
  ownerDocument: Document,
  hyphenateEnglish: boolean,
): void {
  appendTikzMixedFragment(
    element,
    source,
    ownerDocument,
    hyphenateEnglish,
  );
}

function appendTikzMixedFragment(
  parent: HTMLElement,
  source: string,
  ownerDocument: Document,
  hyphenateEnglish: boolean,
): void {
  let cursor = 0;
  let plainStart = 0;
  const flush = (end: number): void => {
    if (end <= plainStart) return;
    const plainText = source
      .slice(plainStart, end)
      .replace(/--/g, "\u2013");
    parent.appendChild(
      ownerDocument.createTextNode(
        hyphenateEnglish
          ? hyphenateEnglishTikzText(plainText)
          : plainText,
      ),
    );
  };
  while (cursor < source.length) {
    if (source[cursor] === "$") {
      const close = source.indexOf("$", cursor + 1);
      if (close < 0) {
        cursor += 1;
        continue;
      }
      flush(cursor);
      parent.appendChild(
        renderMath(source.slice(cursor + 1, close), false),
      );
      cursor = close + 1;
      plainStart = cursor;
      continue;
    }
    if (source.startsWith(String.raw`\\`, cursor)) {
      flush(cursor);
      cursor += 2;
      const spacing = source.slice(cursor).match(/^\[[^\]]*\]/)?.[0];
      if (spacing) cursor += spacing.length;
      parent.createEl("br");
      plainStart = cursor;
      continue;
    }
    const formatting = source
      .slice(cursor)
      .match(/^\\(textbf|textit)\s*\{/);
    if (formatting) {
      flush(cursor);
      const open = cursor + formatting[0].length - 1;
      const close = matchingTextBrace(source, open);
      if (close < 0) {
        parent.appendChild(
          ownerDocument.createTextNode(source.slice(cursor)),
        );
        return;
      }
      const child = parent.createEl(
        formatting[1] === "textbf" ? "strong" : "em",
      );
      appendTikzMixedFragment(
        child,
        source.slice(open + 1, close),
        ownerDocument,
        hyphenateEnglish,
      );
      cursor = close + 1;
      plainStart = cursor;
      continue;
    }
    if (source.startsWith(String.raw`\ `, cursor)) {
      flush(cursor);
      parent.appendChild(ownerDocument.createTextNode(" "));
      cursor += 2;
      plainStart = cursor;
      continue;
    }
    cursor += 1;
  }
  flush(source.length);
}

function matchingTextBrace(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
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
