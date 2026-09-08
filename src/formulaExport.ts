import { type App, type Editor, MarkdownView, Notice, loadMathJax } from "obsidian";
import { t } from "./l10n/locale";
import { selectFormulaForExport } from "./formulaExportModel";
import { getDesktopFileSystem, getDesktopSaveDialog } from "./tikz/desktopNode";
import type { TikzRenderArtifact } from "./tikz/types";
import { snapshotMathJaxForPng } from "./formulaMathJax";

export type FormulaExportFormat = "svg" | "png";
export type FormulaExportRenderer = "mathjax" | "tex";
/** Receives a complete single-node TikZ source, ready for the existing native backend. */
export type FormulaNativeRenderer = (source: string) => Promise<TikzRenderArtifact>;
type Failure = "formulaExportUnavailable" | "formulaExportInvalidSvg" | "formulaExportTooLarge" | "formulaExportFailed";
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const PNG_SCALE = 3;
const MAX_EDGE = 8192;
const MAX_PIXELS = 16_777_216;

class FormulaExportError extends Error {
  constructor(readonly key: Failure) { super(key); }
}

/** Export a snapshot of one formula; asynchronous rendering never edits notes. */
export async function exportSingleFormula(
  app: App, editor: Editor, format: FormulaExportFormat, nativeRenderer?: FormulaNativeRenderer,
  renderer: FormulaExportRenderer = "mathjax",
): Promise<void> {
  const selections = editor.listSelections();
  if (selections.length !== 1) {
    new Notice(t("formulaExportSingleSelection"));
    return;
  }
  const source = editor.getValue();
  const offsets = [editor.posToOffset(selections[0].anchor), editor.posToOffset(selections[0].head)].sort((a, b) => a - b);
  const selected = selectFormulaForExport(source, offsets[0], offsets[1]);
  if (!selected.ok) {
    const messages = {
      "no-formula": "formulaExportNoFormula",
      "multiple-formulas": "formulaExportMultipleFormulas",
      protected: "formulaExportProtected",
      "document-too-large": "formulaExportLargeDocument",
    } as const;
    new Notice(t(messages[selected.reason]));
    return;
  }
  const view = app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view)
    .find((candidate) => candidate instanceof MarkdownView && candidate.editor === editor);
  const ownerDocument = view?.containerEl.ownerDocument ?? window.activeDocument;
  await exportFormulaImage(selected.latex, selected.display, format, ownerDocument, nativeRenderer, renderer);
}

/** Export an explicit source snapshot, including a rendered block outside the active editor. */
export async function exportFormulaImage(
  latex: string, display: boolean, format: FormulaExportFormat, ownerDocument: Document,
  nativeRenderer?: FormulaNativeRenderer,
  renderer: FormulaExportRenderer = "mathjax",
): Promise<void> {
  let progress: Notice | undefined;
  try {
    const write = await chooseTarget(ownerDocument, format);
    if (!write) return;
    progress = new Notice(`${t("formulaExportTitle")}…`, 0);
    await write(await createFormulaImage(latex, display, format, ownerDocument, nativeRenderer, renderer));
    new Notice(t("formulaExportSaved"));
  } catch (error) {
    console.error("[Math Chords] Formula export failed", error);
    const message = t(error instanceof FormulaExportError ? error.key : "formulaExportFailed");
    const lines = error instanceof FormulaExportError ? [] : String(error instanceof Error ? error.message : error).split(/\r?\n/);
    // Native process errors begin with the command. Prefer TeX's diagnostic and
    // source context so a syntax failure is not mistaken for a missing engine.
    const texError = lines.findIndex((line) => /^!\s/.test(line));
    const detail = (texError < 0 ? lines[0] ?? "" : [
      lines[texError], lines.slice(texError + 1).find((line) => /^l\.\d+\s/.test(line)),
    ].filter(Boolean).join("\n")).slice(0, 300);
    new Notice(detail ? `${message}\n${detail}` : message, 10_000);
  } finally {
    progress?.hide();
  }
}

/** Start the clipboard write during the click; supply the PNG when rendering finishes. */
export async function copyFormulaImage(latex: string, display: boolean, ownerDocument: Document): Promise<void> {
  const win = ownerDocument.defaultView;
  const clipboard = win?.navigator.clipboard;
  if (!clipboard?.write || !win?.ClipboardItem) {
    new Notice(t("formulaCopyUnavailable"));
    return;
  }
  const progress = new Notice(`${t("formulaCopyTitle")}…`, 0);
  const image = createFormulaImage(latex, display, "png", ownerDocument);
  void image.catch(() => undefined);
  try {
    const item = new win.ClipboardItem({ "image/png": image });
    await clipboard.write([item]);
    await image;
    new Notice(t("formulaCopyDone"));
  } catch (error) {
    console.error("[Math Chords] Formula image copy failed", error);
    new Notice(t(error instanceof FormulaExportError ? error.key : "formulaCopyFailed"), 10_000);
  } finally {
    // Also consume rendering failures if the clipboard rejects before reading the PNG.
    await image.catch(() => undefined);
    progress.hide();
  }
}

async function createFormulaImage(
  latex: string, display: boolean, format: FormulaExportFormat, ownerDocument: Document,
  nativeRenderer?: FormulaNativeRenderer, renderer: FormulaExportRenderer = "mathjax",
): Promise<Blob> {
  const host = ownerDocument.createElement("div");
  host.className = "obsidian-math-chords-formula-export-host";
  ownerDocument.body.appendChild(host);
  try {
    let snapshot: { source: string; width: number; height: number };
    let containsHtml = false;
    if (renderer === "tex") {
      if (!nativeRenderer) throw new FormulaExportError("formulaExportUnavailable");
      const rendered = await renderLatexSvg(latex, display, ownerDocument, nativeRenderer);
      snapshot = standaloneSvg(rendered.svg, rendered.definitionDocument);
    } else {
      try {
        const rendered = await renderNativeSvg(latex, display, ownerDocument, host);
        snapshot = standaloneSvg(rendered.svg, rendered.definitionDocument);
      } catch (error) {
        if (!(error instanceof FormulaExportError) || error.key !== "formulaExportUnavailable" || format !== "png") throw error;
        snapshot = await snapshotMathJaxForPng(latex, display, host);
        containsHtml = true;
      }
    }
    const BlobCtor = ownerDocument.defaultView?.Blob ?? Blob;
    const svgBlob = new BlobCtor([snapshot.source], { type: "image/svg+xml;charset=utf-8" });
    return format === "svg" ? svgBlob : await transparentPng(svgBlob, snapshot.width, snapshot.height, ownerDocument, containsHtml);
  } finally {
    host.remove();
  }
}

interface NativeMathJax {
  tex2svgPromise?: (latex: string, options: { display: boolean }) => Promise<HTMLElement>;
  tex2svg?: (latex: string, options: { display: boolean }) => HTMLElement;
}

interface RenderedSvg { svg: SVGSVGElement; definitionDocument: Document }

async function renderNativeSvg(latex: string, display: boolean, ownerDocument: Document, host: HTMLElement): Promise<RenderedSvg> {
  try { await loadMathJax(); }
  catch { throw new FormulaExportError("formulaExportUnavailable"); }
  const native = (ownerDocument.defaultView as unknown as { MathJax?: NativeMathJax } | null)?.MathJax
    ?? (window as unknown as { MathJax?: NativeMathJax }).MathJax;
  let result: HTMLElement;
  if (typeof native?.tex2svgPromise === "function") result = await native.tex2svgPromise(latex, { display });
  else if (typeof native?.tex2svg === "function") result = native.tex2svg(latex, { display });
  // Obsidian's renderMath produces CHTML. Waiting for its stylesheet flush cannot
  // provide vector paths, and can stall exports from a background/popout window.
  else throw new FormulaExportError("formulaExportUnavailable");
  const definitionDocument = result.ownerDocument;
  if (!host.contains(result)) host.appendChild(result);
  const svg = result.querySelector<SVGSVGElement>("svg");
  if (!svg) throw new FormulaExportError("formulaExportUnavailable");
  if (svg.querySelector('[data-mjx-error], [data-mml-node="merror"]')) {
    throw new FormulaExportError("formulaExportInvalidSvg");
  }
  return { svg, definitionDocument };
}

async function renderLatexSvg(
  latex: string, display: boolean, ownerDocument: Document, render: FormulaNativeRenderer,
): Promise<RenderedSvg> {
  // Display blocks include the newlines next to $$. Adding our own separators
  // around those creates blank paragraphs inside TeX math mode.
  const source = `\\begin{tikzpicture}\n\\node[inner sep=0pt,outer sep=0pt,text=black] {$${display ? "\\displaystyle" : ""}\n${latex.trim()}\n$};\n\\end{tikzpicture}`;
  const artifact = await render(source);
  if (artifact.mediaType !== "image/svg+xml") throw new FormulaExportError("formulaExportUnavailable");
  const Parser = ownerDocument.defaultView?.DOMParser ?? DOMParser;
  const document = new Parser().parseFromString(new TextDecoder().decode(artifact.bytes), "image/svg+xml");
  const root = document.documentElement;
  if (document.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    throw new FormulaExportError("formulaExportInvalidSvg");
  }
  return { svg: root as unknown as SVGSVGElement, definitionDocument: document };
}

function standaloneSvg(source: SVGSVGElement, definitionDocument: Document): { source: string; width: number; height: number } {
  const ownerDocument = source.ownerDocument;
  const root = source.cloneNode(true) as SVGSVGElement;
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new FormulaExportError("formulaExportInvalidSvg");
  }
  const bounds = source.getBoundingClientRect();
  const width = bounds.width || svgLength(root.getAttribute("width"));
  const height = bounds.height || svgLength(root.getAttribute("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new FormulaExportError("formulaExportInvalidSvg");
  }
  if (width * PNG_SCALE > MAX_EDGE || height * PNG_SCALE > MAX_EDGE || width * height * PNG_SCALE ** 2 > MAX_PIXELS) {
    throw new FormulaExportError("formulaExportTooLarge");
  }
  let defs = root.querySelector("defs");
  if (!defs) {
    defs = ownerDocument.createElementNS(SVG_NS, "defs");
    root.insertBefore(defs, root.firstChild);
  }
  const ids = new Set(Array.from(root.querySelectorAll("[id]"), (element) => element.id));
  const queue: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
  for (let index = 0; index < queue.length; index++) {
    const element = queue[index];
    if (element.namespaceURI !== SVG_NS || !["svg", "g", "defs", "symbol", "path", "use", "rect", "line", "polygon", "polyline", "circle", "ellipse", "clipPath", "mask", "marker", "pattern", "linearGradient", "radialGradient", "stop", "a", "title", "desc"].includes(element.localName)) {
      throw new FormulaExportError("formulaExportInvalidSvg");
    }
    const references = new Set<string>();
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value;
      if (/^on/i.test(attribute.name) || attribute.name === "class") { element.removeAttribute(attribute.name); continue; }
      if (attribute.localName === "href") {
        if (value.startsWith("#")) references.add(value.slice(1));
        else if (element.localName === "a") element.removeAttribute(attribute.name);
        else throw new FormulaExportError("formulaExportInvalidSvg");
      }
      for (const match of value.matchAll(/url\(([^)]*)\)/gi)) {
        const reference = /^\s*['"]?#([^\s)'";]+)['"]?\s*$/.exec(match[1]);
        if (!reference) throw new FormulaExportError("formulaExportInvalidSvg");
        references.add(reference[1]);
      }
      if (/var\(/i.test(value) || /url\(/i.test(value.replace(/url\([^)]*\)/gi, ""))) throw new FormulaExportError("formulaExportInvalidSvg");
      if (/currentColor/i.test(value)) element.setAttribute(attribute.name, value.replace(/currentColor/gi, "#000000"));
    }
    for (const id of references) {
      if (ids.has(id)) continue;
      const definition = definitionDocument.getElementById(id) ?? ownerDocument.getElementById(id);
      if (!definition || definition.namespaceURI !== SVG_NS) throw new FormulaExportError("formulaExportInvalidSvg");
      const cloned = definition.cloneNode(true) as Element;
      defs.appendChild(cloned);
      ids.add(id);
      for (const descendant of Array.from(cloned.querySelectorAll("[id]"))) ids.add(descendant.id);
      queue.push(cloned, ...Array.from(cloned.querySelectorAll("*")));
    }
  }
  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("xmlns:xlink", XLINK_NS);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("color", "#000000");
  root.setAttribute("fill", "#000000");
  root.removeAttribute("style");
  root.removeAttribute("class");
  const Serializer = ownerDocument.defaultView?.XMLSerializer ?? XMLSerializer;
  return { source: new Serializer().serializeToString(root), width, height };
}

function svgLength(value: string | null): number {
  const match = /^(\d*\.?\d+)(px|ex|em|pt)?$/.exec(value ?? "");
  if (!match) return NaN;
  const scale = match[2] === "ex" ? 8 : match[2] === "em" ? 16 : match[2] === "pt" ? 96 / 72 : 1;
  return Number(match[1]) * scale;
}

async function transparentPng(blob: Blob, width: number, height: number, ownerDocument: Document, containsHtml = false): Promise<Blob> {
  if (Math.ceil(width * PNG_SCALE) > MAX_EDGE || Math.ceil(height * PNG_SCALE) > MAX_EDGE ||
      Math.ceil(width * PNG_SCALE) * Math.ceil(height * PNG_SCALE) > MAX_PIXELS) {
    throw new FormulaExportError("formulaExportTooLarge");
  }
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = Math.ceil(width * PNG_SCALE);
  canvas.height = Math.ceil(height * PNG_SCALE);
  const context = canvas.getContext("2d");
  if (!context) throw new FormulaExportError("formulaExportFailed");
  const UrlCtor = ownerDocument.defaultView?.URL ?? URL;
  const ImageCtor = ownerDocument.defaultView?.Image ?? Image;
  // A self-contained data URL allows Chromium to rasterize local CHTML without tainting the canvas.
  const url = containsHtml ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await blob.text())}` : UrlCtor.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new ImageCtor();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new FormulaExportError("formulaExportInvalidSvg"));
      value.src = url;
    });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (output) => output ? resolve(output) : reject(new FormulaExportError("formulaExportFailed")), "image/png",
    ));
  } finally {
    if (!containsHtml) UrlCtor.revokeObjectURL(url);
  }
}

async function chooseTarget(ownerDocument: Document, format: FormulaExportFormat): Promise<((blob: Blob) => Promise<void>) | null> {
  const dialog = getDesktopSaveDialog(ownerDocument.defaultView);
  if (!dialog) throw new FormulaExportError("formulaExportFailed");
  const result = await dialog.showSaveDialog({
    title: t("formulaExportTitle"), defaultPath: `formula.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return null;
  const path = result.filePath.toLowerCase().endsWith(`.${format}`) ? result.filePath : `${result.filePath}.${format}`;
  return async (blob) => {
    const fs = getDesktopFileSystem(ownerDocument.defaultView);
    await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  };
}
