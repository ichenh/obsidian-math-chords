import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { Notice, Platform, setIcon } from "obsidian";
import type { TikzBackendMode } from "../settings";
import type { TikzRenderCoordinator } from "./coordinator";
import { findTikzFenceBlocks, type TikzFenceBlock } from "./fences";
import { TikzPreviewSurface } from "./previewSurface";
import type { TikzFontPreferences } from "./fonts";
import { exportTikzPreview } from "./exportPreview";
import {
  resizeFloatingRect,
  type FloatingResizeDirection,
} from "./floatingResize";

export interface TikzLivePreviewOptions {
  coordinator: TikzRenderCoordinator;
  isEnabled: () => boolean;
  getLanguage: () => string;
  getBackend: () => TikzBackendMode;
  getFonts: () => TikzFontPreferences;
  getLocale: () => string;
}

let editorPreviewId = 0;
const MAX_LIVE_PREVIEW_DOCUMENT_LENGTH = 100_000;
const RESIZE_DIRECTIONS: FloatingResizeDirection[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

export function createTikzLivePreviewExtension(
  options: TikzLivePreviewOptions,
) {
  return ViewPlugin.fromClass(
    class {
      private readonly editorId = ++editorPreviewId;
      private readonly panelEl: HTMLElement;
      private readonly dragHandleEl: HTMLElement;
      private readonly exportButtonEl: HTMLButtonElement;
      private readonly surface: TikzPreviewSurface;
      private blocks: TikzFenceBlock[] = [];
      private language = "";
      private enabled = false;
      private activeBlock: TikzFenceBlock | null = null;
      private hasRendered = false;
      private requestedSource = "";
      private userPositioned = false;
      private stopDragging: (() => void) | null = null;
      private stopResizing: (() => void) | null = null;

      constructor(private view: EditorView) {
        const ownerDocument = view.dom.ownerDocument;
        this.panelEl = ownerDocument.body.createDiv();
        this.panelEl.className =
          "obsidian-math-chords-tikz-floating-preview";
        this.panelEl.hidden = true;
        this.panelEl.addEventListener("pointerdown", () => {
          this.userPositioned = true;
        });
        this.dragHandleEl = this.panelEl.createDiv();
        this.dragHandleEl.className =
          "obsidian-math-chords-tikz-floating-drag-handle";
        this.dragHandleEl.setAttribute("aria-label", "Drag preview");
        this.dragHandleEl.addEventListener(
          "pointerdown",
          this.startDragging,
        );
        this.exportButtonEl = this.dragHandleEl.createEl("button");
        this.exportButtonEl.className =
          "clickable-icon obsidian-math-chords-tikz-export-button";
        this.exportButtonEl.type = "button";
        this.exportButtonEl.disabled = true;
        this.exportButtonEl.setAttribute("aria-label", "Export diagram");
        this.exportButtonEl.setAttribute("title", "Export diagram");
        setIcon(this.exportButtonEl, "download");
        this.exportButtonEl.hidden = !Platform.isDesktop;
        this.exportButtonEl.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
        });
        this.exportButtonEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.exportPreview();
        });
        for (const direction of RESIZE_DIRECTIONS) {
          const handle = this.panelEl.createDiv();
          handle.className =
            `obsidian-math-chords-tikz-resize-handle is-${direction}`;
          handle.setAttribute("aria-hidden", "true");
          handle.addEventListener("pointerdown", (event) => {
            this.startResizing(direction, event);
          });
        }
        ownerDocument.addEventListener(
          "pointerdown",
          this.onDocumentPointerDown,
          true,
        );

        this.surface = new TikzPreviewSurface(ownerDocument, {
          coordinator: options.coordinator,
          consumerKey: `editor-floating-${this.editorId}`,
          getBackend: options.getBackend,
          getFonts: options.getFonts,
          getLocale: options.getLocale,
          getTheme: () =>
            ownerDocument.body.classList.contains("theme-dark")
              ? "dark"
              : "light",
          onReady: () => {
            this.hasRendered = true;
            this.exportButtonEl.disabled = false;
            if (this.activeBlock) {
              this.panelEl.hidden = false;
            }
          },
          onError: () => {
            if (this.activeBlock) {
              this.positionPanel();
              this.panelEl.hidden = false;
            }
          },
        });
        this.surface.containerEl.addClass("is-live-editor");
        this.panelEl.appendChild(this.surface.containerEl);
        this.refresh(true);
      }

      update(update: ViewUpdate): void {
        const settingsChanged =
          options.isEnabled() !== this.enabled ||
          options.getLanguage() !== this.language;
        this.view = update.view;
        this.refresh(update.docChanged || settingsChanged);
      }

      destroy(): void {
        this.stopDragging?.();
        this.stopResizing?.();
        this.panelEl.ownerDocument.removeEventListener(
          "pointerdown",
          this.onDocumentPointerDown,
          true,
        );
        this.surface.destroy();
        this.panelEl.remove();
      }

      private refresh(reparse: boolean): void {
        const enabled = options.isEnabled();
        const language = options.getLanguage();
        this.enabled = enabled;
        this.language = language;

        if (
          !enabled ||
          this.view.state.doc.length > MAX_LIVE_PREVIEW_DOCUMENT_LENGTH
        ) {
          this.blocks = [];
          this.activeBlock = null;
          this.panelEl.hidden = true;
          return;
        }
        if (reparse) {
          this.blocks = findTikzFenceBlocks(this.view.state.doc, language);
        }

        const caret = this.view.state.selection.main.head;
        const nextBlock =
          this.blocks.find(
            (block) => caret >= block.from && caret <= block.to,
          ) ?? null;
        if (!nextBlock) {
          this.activeBlock = null;
          this.panelEl.hidden = true;
          return;
        }
        const renderImmediately =
          this.activeBlock === null ||
          this.activeBlock.from !== nextBlock.from;
        this.activeBlock = nextBlock;

        this.positionPanel();
        this.panelEl.hidden = false;
        if (nextBlock.source !== this.requestedSource) {
          this.requestedSource = nextBlock.source;
          this.exportButtonEl.disabled = true;
        }
        this.surface.render(nextBlock.source, renderImmediately);
      }

      private positionPanel(): void {
        if (this.userPositioned) return;
        const win = this.panelEl.ownerDocument.defaultView;
        if (!win) return;
        const titlebar = this.panelEl.ownerDocument.querySelector<HTMLElement>(
          ".titlebar",
        );
        const titlebarBottom = titlebar?.getBoundingClientRect().bottom ?? 0;
        const width = Math.max(
          240,
          Math.min(560, win.innerWidth - 32),
        );
        const left = Math.max(16, win.innerWidth - width - 16);
        const top = Math.max(16, titlebarBottom + 12);
        this.panelEl.style.width = `${width}px`;
        this.panelEl.style.left = `${left}px`;
        this.panelEl.style.top = `${top}px`;
      }

      private readonly onDocumentPointerDown = (
        event: PointerEvent,
      ): void => {
        const target = event.target;
        const NodeCtor = this.panelEl.ownerDocument.defaultView?.Node;
        if (!NodeCtor || !(target instanceof NodeCtor) || this.panelEl.contains(target)) {
          return;
        }
        if (!this.view.dom.contains(target)) {
          this.closePanel();
          return;
        }
        this.panelEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
          if (this.panelEl.isConnected) this.refresh(false);
        });
      };

      private readonly startDragging = (event: PointerEvent): void => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.stopDragging?.();
        this.stopResizing?.();
        this.userPositioned = true;

        const ownerDocument = this.panelEl.ownerDocument;
        const win = ownerDocument.defaultView;
        if (!win) return;
        const startRect = this.panelEl.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;

        const move = (moveEvent: PointerEvent): void => {
          const maxLeft = Math.max(0, win.innerWidth - startRect.width);
          const maxTop = Math.max(0, win.innerHeight - 24);
          const left = Math.min(
            maxLeft,
            Math.max(0, startRect.left + moveEvent.clientX - startX),
          );
          const top = Math.min(
            maxTop,
            Math.max(0, startRect.top + moveEvent.clientY - startY),
          );
          this.panelEl.style.left = `${left}px`;
          this.panelEl.style.top = `${top}px`;
        };
        const stop = (): void => {
          ownerDocument.removeEventListener("pointermove", move);
          ownerDocument.removeEventListener("pointerup", stop);
          ownerDocument.removeEventListener("pointercancel", stop);
          this.stopDragging = null;
        };
        ownerDocument.addEventListener("pointermove", move);
        ownerDocument.addEventListener("pointerup", stop);
        ownerDocument.addEventListener("pointercancel", stop);
        this.stopDragging = stop;
      };

      private startResizing(
        direction: FloatingResizeDirection,
        event: PointerEvent,
      ): void {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.stopDragging?.();
        this.stopResizing?.();
        this.userPositioned = true;

        const ownerDocument = this.panelEl.ownerDocument;
        const win = ownerDocument.defaultView;
        if (!win) return;
        const startRect = this.panelEl.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;

        const move = (moveEvent: PointerEvent): void => {
          const rect = resizeFloatingRect(
            {
              left: startRect.left,
              top: startRect.top,
              width: startRect.width,
              height: startRect.height,
            },
            direction,
            moveEvent.clientX - startX,
            moveEvent.clientY - startY,
            win.innerWidth,
            win.innerHeight,
          );
          this.panelEl.style.left = `${rect.left}px`;
          this.panelEl.style.top = `${rect.top}px`;
          this.panelEl.style.width = `${rect.width}px`;
          this.panelEl.style.height = `${rect.height}px`;
        };
        const stop = (): void => {
          ownerDocument.removeEventListener("pointermove", move);
          ownerDocument.removeEventListener("pointerup", stop);
          ownerDocument.removeEventListener("pointercancel", stop);
          this.stopResizing = null;
        };
        ownerDocument.addEventListener("pointermove", move);
        ownerDocument.addEventListener("pointerup", stop);
        ownerDocument.addEventListener("pointercancel", stop);
        this.stopResizing = stop;
      }

      private closePanel(): void {
        this.activeBlock = null;
        this.panelEl.hidden = true;
      }

      private async exportPreview(): Promise<void> {
        const data = this.surface.getExportData();
        if (!data) return;
        try {
          await exportTikzPreview(data);
        } catch (error) {
          new Notice(
            error instanceof Error
              ? error.message
              : "Could not export the TikZ preview.",
          );
        }
      }
    },
  );
}
