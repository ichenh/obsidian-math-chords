import { editorLivePreviewField, finishRenderMath, renderMath } from "obsidian";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  extractMathContent,
  findMathRegionAt,
  hasUnclosedDisplayMath,
  isValidMathRegion,
} from "./math";

const PREVIEW_GAP = 8;
const PLACEHOLDER_TEXT = "在此输入 LaTeX，预览将实时显示";

export interface InlinePreviewContext {
  isEnabled: () => boolean;
  isActiveView: (view: EditorView) => boolean;
}

function isLivePreview(view: EditorView): boolean {
  try {
    return view.state.field(editorLivePreviewField);
  } catch {
    return false;
  }
}

function mergeClientRects(rects: ArrayLike<DOMRect>): DOMRect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (rect.width === 0 && rect.height === 0) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  if (left === Infinity) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

function clampDomOffset(node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.max(0, Math.min(offset, node.textContent?.length ?? 0));
  }
  return Math.max(0, Math.min(offset, node.childNodes.length));
}

function getDomRangeRect(view: EditorView, from: number, to: number): DOMRect | null {
  const range = view.dom.ownerDocument.createRange();
  try {
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    range.setStart(start.node, clampDomOffset(start.node, start.offset));
    range.setEnd(end.node, clampDomOffset(end.node, end.offset));
  } catch {
    return null;
  }

  return mergeClientRects(range.getClientRects()) ?? nullIfEmpty(range.getBoundingClientRect());
}

function nullIfEmpty(rect: DOMRect): DOMRect | null {
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function getCoordsRect(view: EditorView, from: number, to: number): DOMRect | null {
  const open = view.coordsAtPos(from, -1);
  if (!open) return null;

  const close = view.coordsAtPos(to, 1);
  if (!close) {
    return new DOMRect(open.left, open.top, 24, Math.max(open.bottom - open.top, 18));
  }

  const top = Math.min(open.top, close.top);
  const bottom = Math.max(open.bottom, close.bottom);
  return new DOMRect(open.left, top, Math.max(close.right - open.left, 24), Math.max(bottom - top, 18));
}

function findRenderedMathRect(view: EditorView): DOMRect | null {
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection?.anchorNode) return null;

  let element: HTMLElement | null =
    selection.anchorNode instanceof HTMLElement
      ? selection.anchorNode
      : selection.anchorNode.parentElement;

  while (element && element !== view.dom) {
    if (
      element.classList.contains("mjx-container") ||
      element.classList.contains("MathJax") ||
      element.tagName === "MJX-CONTAINER"
    ) {
      return element.getBoundingClientRect();
    }

    if (element.classList.contains("cm-line")) {
      const mjx = element.querySelector(".mjx-container, mjx-container");
      if (mjx instanceof HTMLElement) return mjx.getBoundingClientRect();

      const delimiters = element.querySelectorAll(".cm-formatting-math");
      if (delimiters.length >= 2) {
        const merged = mergeClientRects([
          delimiters[0].getBoundingClientRect(),
          delimiters[delimiters.length - 1].getBoundingClientRect(),
        ]);
        if (merged) return merged;
      }
    }

    element = element.parentElement;
  }

  return null;
}

function getCaretRect(view: EditorView): DOMRect | null {
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const live = selection.getRangeAt(0);
  if (!view.dom.contains(live.startContainer)) return null;

  const collapsed = live.cloneRange();
  collapsed.collapse(true);
  return mergeClientRects(collapsed.getClientRects()) ?? nullIfEmpty(collapsed.getBoundingClientRect());
}

function getInlineMathAnchorRect(
  view: EditorView,
  region: { from: number; to: number },
): DOMRect | null {
  const livePreview = isLivePreview(view);

  const domRange = getDomRangeRect(view, region.from, region.to);
  const coords = getCoordsRect(view, region.from, region.to);

  if (livePreview) {
    const rendered = findRenderedMathRect(view);
    if (rendered) {
      if (!domRange || domRange.width < 4) return rendered;
      return new DOMRect(
        domRange.left,
        Math.min(domRange.top, rendered.top),
        Math.max(domRange.width, rendered.width),
        Math.max(domRange.height, rendered.height),
      );
    }
  }

  if (domRange) return domRange;
  if (coords) return coords;

  const caret = getCaretRect(view);
  if (caret) {
    const open = view.coordsAtPos(region.from, -1);
    const left = open?.left ?? caret.left;
    return new DOMRect(left, caret.top, Math.max(caret.width, 48), Math.max(caret.height, 18));
  }

  return null;
}

/**
 * Obsidian MathJax preview — same engine/fonts as rendered $$…$$ in the note.
 * Host lives on document.body (not Shadow DOM) so MathJax CSS applies.
 * Call finishRenderMath() debounced after renderMath so the first preview is not blank.
 */
class InlinePreviewLayer {
  private readonly host: HTMLElement;
  private readonly body: HTMLElement;
  private mathFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private renderGeneration = 0;

  constructor(private readonly ownerDocument: Document) {
    this.host = ownerDocument.body.createDiv({ cls: "obsidian-math-chords-inline-preview-host" });
    const panel = this.host.createDiv({ cls: "obsidian-math-chords-inline-preview-panel" });
    this.body = panel.createDiv({ cls: "obsidian-math-chords-inline-preview-body" });
    this.host.style.display = "none";
  }

  destroy(): void {
    if (this.mathFlushTimer) {
      clearTimeout(this.mathFlushTimer);
      this.mathFlushTimer = null;
    }
    this.host.remove();
  }

  hide(): void {
    this.host.style.display = "none";
  }

  show(latex: string, anchor: DOMRect): void {
    const generation = ++this.renderGeneration;
    this.body.empty();

    const trimmed = latex.trim();
    if (!trimmed) {
      this.body.createDiv({
        cls: "obsidian-math-chords-inline-preview-placeholder",
        text: PLACEHOLDER_TEXT,
      });
    } else {
      this.appendMath(trimmed);
      this.scheduleMathFlush(generation, trimmed);
    }

    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 80));
    const bottom = window.innerHeight - anchor.top + PREVIEW_GAP;

    this.host.style.display = "block";
    this.host.style.position = "fixed";
    this.host.style.left = `${left}px`;
    this.host.style.bottom = `${bottom}px`;
    this.host.style.zIndex = "10050";
    this.host.style.pointerEvents = "none";
    this.host.style.minWidth = `${Math.max(anchor.width, 48)}px`;
    this.host.style.maxWidth = "min(92vw, 640px)";
  }

  private appendMath(latex: string): void {
    const mathEl = renderMath(latex, true);
    mathEl.addClass("obsidian-math-chords-inline-preview-math");
    this.body.appendChild(mathEl);
  }

  private scheduleMathFlush(generation: number, latex: string): void {
    if (this.mathFlushTimer) clearTimeout(this.mathFlushTimer);
    this.mathFlushTimer = setTimeout(() => {
      this.mathFlushTimer = null;
      void this.flushAndRetryIfEmpty(generation, latex);
    }, 0);
  }

  private async flushAndRetryIfEmpty(generation: number, latex: string): Promise<void> {
    await finishRenderMath();
    if (generation !== this.renderGeneration || this.host.style.display === "none") return;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    if (generation !== this.renderGeneration || this.host.style.display === "none") return;

    if (!this.isMathVisible()) {
      this.body.empty();
      this.appendMath(latex);
      await finishRenderMath();
    }
  }

  private isMathVisible(): boolean {
    const mjx = this.body.querySelector(".mjx-container, mjx-container");
    if (!(mjx instanceof HTMLElement)) return false;
    const rect = mjx.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }
}

export function createInlineMathPreviewPlugin(ctx: InlinePreviewContext) {
  return ViewPlugin.fromClass(
    class {
      private layer: InlinePreviewLayer | null = null;
      private rafId = 0;

      constructor(private readonly view: EditorView) {
        this.layer = new InlinePreviewLayer(view.dom.ownerDocument);
      }

      destroy(): void {
        if (this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = 0;
        }
        this.layer?.destroy();
        this.layer = null;
      }

      update(update: ViewUpdate): void {
        if (!this.layer) return;

        if (!ctx.isEnabled() || !ctx.isActiveView(this.view)) {
          this.layer.hide();
          return;
        }

        if (
          !update.docChanged &&
          !update.selectionSet &&
          !update.focusChanged &&
          !update.viewportChanged &&
          !update.geometryChanged
        ) {
          return;
        }

        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.refresh();
        });
      }

      private refresh(): void {
        if (!this.layer || !ctx.isEnabled() || !ctx.isActiveView(this.view)) {
          this.layer?.hide();
          return;
        }

        const text = this.view.state.doc.toString();
        if (hasUnclosedDisplayMath(text)) {
          this.layer.hide();
          return;
        }

        const offset = this.view.state.selection.main.head;
        const region = findMathRegionAt(text, offset);
        if (!region || region.kind !== "inline" || !isValidMathRegion(text, region)) {
          this.layer.hide();
          return;
        }

        const latex = extractMathContent(text, region);
        const anchor = getInlineMathAnchorRect(this.view, region);
        if (!anchor) {
          this.layer.hide();
          return;
        }

        this.layer.show(latex, anchor);
      }
    },
  );
}
