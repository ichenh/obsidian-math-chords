import { ViewPlugin } from "@codemirror/view";
import {
  MarkdownRenderChild, Menu, Notice, setIcon,
  type MarkdownPostProcessorContext, type Plugin,
} from "obsidian";
import type { FormulaExportFormat, FormulaExportRenderer } from "./formulaExport";
import { displayFormulaAtPosition, displayFormulaInSection } from "./formulaExportModel";
import { t } from "./l10n/locale";

const BLOCK_SELECTOR = ".math.math-block";
const BUTTON_CLASS = "obsidian-math-chords-formula-block-export";
const COPY_CLASS = "obsidian-math-chords-formula-block-copy";
const HOST_CLASS = "obsidian-math-chords-formula-block";
type ExportBlock = (latex: string, format: FormulaExportFormat, document: Document, renderer: FormulaExportRenderer) => void;
type CopyBlock = (latex: string, document: Document) => void;

/** Observe only the rendered view, never the vault or the whole application document. */
export class FormulaBlockExportControls {
  private readonly observer: MutationObserver;
  private readonly controls = new Map<HTMLElement, { button: HTMLButtonElement; copy: HTMLButtonElement; toolbar: HTMLElement | null }>();
  private menu: Menu | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly resolveSource: (block: HTMLElement) => string | null,
    private readonly exportBlock: ExportBlock,
    private readonly livePreview: boolean,
    private readonly copyBlock: CopyBlock,
    enabled = true,
  ) {
    const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new Observer((records) => {
      if (records.some((record) => this.affectsControls(record))) this.refresh();
    });
    this.setEnabled(enabled);
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) { this.destroy(); return; }
    this.observer.observe(this.root, { childList: true, subtree: true });
    this.refresh();
  }

  private affectsControls(record: MutationRecord): boolean {
    const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
    const block = target?.closest<HTMLElement>(BLOCK_SELECTOR);
    if (block && this.root.contains(block)) {
      const control = this.controls.get(block);
      // MathJax glyph updates and our own icon insertion cannot change existing actions.
      return !control || !block.contains(control.button) || !block.contains(control.copy);
    }
    return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => {
      if (node.nodeType !== 1) return false;
      const element = node as Element;
      return element.matches(BLOCK_SELECTOR) || Boolean(element.querySelector(BLOCK_SELECTOR));
    });
  }

  private refresh(): void {
    for (const [block, control] of this.controls) {
      if (!this.root.contains(block) || !block.contains(control.button) || !block.contains(control.copy)) {
        control.button.remove();
        control.copy.remove();
        control.toolbar?.remove();
        block.classList.remove(HOST_CLASS);
        this.controls.delete(block);
      }
    }
    const blocks = Array.from(this.root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
    if (this.root.matches(BLOCK_SELECTOR)) blocks.unshift(this.root);
    for (const block of blocks) {
      if (this.controls.has(block) || block.querySelector(`.${BUTTON_CLASS}`)) continue;
      if (block.closest(".print, .markdown-embed, .internal-embed")) continue;
      // Live Preview's math widgets own a native edit action; nested rendered content does not.
      const edit = block.querySelector<HTMLElement>(".edit-block-button");
      if (this.livePreview && (!block.classList.contains("cm-embed-block") || !edit)) continue;
      const nativeToolbar = edit?.parentElement;
      const toolbar = nativeToolbar?.classList.contains("embed-actions") ? null : block.ownerDocument.createElement("div");
      if (toolbar) {
        toolbar.className = "obsidian-math-chords-formula-block-actions";
        toolbar.classList.toggle("has-edit-button", Boolean(edit));
        block.appendChild(toolbar);
      }
      const button = this.createButton(block, BUTTON_CLASS, t("formulaExportTitle"), "download");
      button.setAttribute("title", t("formulaExportButtonDesc"));
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => this.openMenu(block, button));
      const copy = this.createButton(block, COPY_CLASS, t("formulaCopyTitle"), "copy");
      copy.setAttribute("title", t("formulaCopyButtonDesc"));
      copy.addEventListener("click", () => {
        const latex = this.sourceFor(block);
        if (latex) this.copyBlock(latex, block.ownerDocument);
      });
      for (const action of [copy, button]) {
        if (toolbar) toolbar.appendChild(action);
        else nativeToolbar?.insertBefore(action, edit ?? null);
      }
      block.classList.add(HOST_CLASS);
      this.controls.set(block, { button, copy, toolbar });
    }
  }

  private createButton(block: HTMLElement, className: string, title: string, icon: string): HTMLButtonElement {
    const button = block.ownerDocument.createElement("button");
    button.type = "button";
    button.className = `${className} obsidian-math-chords-formula-block-action clickable-icon embed-action interactive-child`;
    button.setAttribute("aria-label", title);
    button.setAttribute("title", title);
    setIcon(button, icon);
    // Keep action gestures from activating the native source editor.
    for (const name of ["pointerdown", "mousedown", "dblclick", "click"] as const) {
      button.addEventListener(name, (event) => { event.preventDefault(); event.stopPropagation(); });
    }
    button.addEventListener("keydown", (event) => event.stopPropagation());
    return button;
  }

  private sourceFor(block: HTMLElement): string | null {
    let latex: string | null;
    try { latex = this.resolveSource(block); }
    catch { latex = null; }
    if (!latex?.trim()) {
      new Notice(t("formulaExportNoFormula"));
      return null;
    }
    return latex;
  }

  private openMenu(block: HTMLElement, button: HTMLButtonElement): void {
    const latex = this.sourceFor(block);
    if (!latex) return;
    // Capture before opening the menu: switching panes or editing later cannot retarget this export.
    const snapshot = latex;
    this.menu?.hide();
    const menu = new Menu();
    this.menu = menu;
    for (const [format, label, renderer] of [
      ["png", "cmdExportFormulaPng", "mathjax"],
      ["svg", "cmdExportFormulaSvg", "tex"],
      ["png", "formulaExportPngTex", "tex"],
    ] as const) {
      menu.addItem((item) => item.setTitle(t(label)).setIcon("download")
        .onClick(() => this.exportBlock(snapshot, format, block.ownerDocument, renderer)));
    }
    button.setAttribute("aria-expanded", "true");
    menu.onHide(() => {
      button.setAttribute("aria-expanded", "false");
      if (this.menu === menu) this.menu = null;
    });
    const bounds = button.getBoundingClientRect();
    menu.showAtPosition({ x: bounds.left, y: bounds.bottom }, block.ownerDocument);
  }

  destroy(): void {
    this.observer.disconnect();
    this.menu?.hide();
    this.menu = null;
    for (const [block, { button, copy, toolbar }] of this.controls) {
      button.remove();
      copy.remove();
      toolbar?.remove();
      block.classList.remove(HOST_CLASS);
    }
    this.controls.clear();
  }
}

function readingSource(root: HTMLElement, block: HTMLElement, context: MarkdownPostProcessorContext): string | null {
  const info = context.getSectionInfo(block);
  if (!info) return null;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  if (root.matches(BLOCK_SELECTOR)) blocks.unshift(root);
  const sectionBlocks = blocks.filter((candidate) => {
    const section = context.getSectionInfo(candidate);
    return section?.lineStart === info.lineStart && section.lineEnd === info.lineEnd;
  });
  return displayFormulaInSection(info.text, info.lineStart, info.lineEnd, sectionBlocks.indexOf(block), sectionBlocks.length);
}

export function registerFormulaBlockExport(
  plugin: Plugin, exportBlock: ExportBlock, copyBlock: CopyBlock, isEnabled: () => boolean = () => true,
): () => void {
  const active = new Set<FormulaBlockExportControls>();
  const track = (controls: FormulaBlockExportControls): (() => void) => {
    active.add(controls);
    return () => { controls.destroy(); active.delete(controls); };
  };
  plugin.register(() => {
    for (const controls of active) controls.destroy();
    active.clear();
  });
  plugin.registerEditorExtension(ViewPlugin.define((view) => {
    const controls = new FormulaBlockExportControls(view.contentDOM, (block) =>
      displayFormulaAtPosition(view.state.doc.toString(), view.posAtDOM(block)), exportBlock, true, copyBlock, isEnabled());
    return { destroy: track(controls) };
  }));
  plugin.registerMarkdownPostProcessor((root, context) => {
    if (!root.matches(BLOCK_SELECTOR) && !root.querySelector(BLOCK_SELECTOR)) return;
    if (root.closest(".print, .markdown-source-view")) return;
    const child = new MarkdownRenderChild(root);
    child.onload = () => child.register(track(new FormulaBlockExportControls(
      root, (block) => readingSource(root, block, context), exportBlock, false, copyBlock, isEnabled(),
    )));
    context.addChild(child);
  });
  return () => { for (const controls of active) controls.setEnabled(isEnabled()); };
}
