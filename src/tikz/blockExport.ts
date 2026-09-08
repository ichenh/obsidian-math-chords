import { Notice, setIcon } from "obsidian";
import { exportTikzPreview, type TikzExportRequest } from "./exportPreview";

/** Own only the actions for one rendered code block, including its native toolbar. */
export class TikzBlockExportControls {
  private readonly button: HTMLButtonElement;
  private readonly observer: MutationObserver;
  private toolbar: HTMLElement | null = null;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly getExportData: () => TikzExportRequest | null,
  ) {
    this.button = host.ownerDocument.createElement("button");
    this.button.type = "button";
    this.button.className =
      "obsidian-math-chords-tikz-block-export clickable-icon embed-action interactive-child";
    this.button.setAttribute("aria-label", "Export diagram");
    this.button.setAttribute("title", "Export diagram");
    setIcon(this.button, "download");
    for (const name of ["pointerdown", "mousedown", "dblclick", "click"] as const) {
      this.button.addEventListener(name, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    this.button.addEventListener("keydown", (event) => event.stopPropagation());
    this.button.addEventListener("click", () => { void this.export(); });
    host.classList.add("obsidian-math-chords-tikz-block");
    this.placeButton();
    const Observer = host.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new Observer((records) => {
      if (this.affectsToolbar(records)) this.placeButton();
    });
    // Obsidian can insert or replace its edit toolbar after the render completes.
    this.observer.observe(host, { childList: true, subtree: true });
  }

  private affectsToolbar(records: MutationRecord[]): boolean {
    if (!this.host.contains(this.button)) return true;
    return records.some((record) => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      if (target?.closest(".obsidian-math-chords-tikz-preview, .obsidian-math-chords-tikz-block-export")) return false;
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => {
        if (node.nodeType !== 1) return false;
        const element = node as Element;
        if (element.matches(".obsidian-math-chords-tikz-preview, .obsidian-math-chords-tikz-block-actions, .obsidian-math-chords-tikz-block-export")) return false;
        return element.matches(".edit-block-button, .embed-actions") || Boolean(element.querySelector(".edit-block-button, .embed-actions"));
      });
    });
  }

  private placeButton(): void {
    if (this.destroyed) return;
    const edit = this.host.querySelector<HTMLElement>(".edit-block-button");
    const nativeToolbar = edit?.parentElement;
    if (nativeToolbar?.classList.contains("embed-actions")) {
      if (this.button.parentElement !== nativeToolbar || this.button.nextElementSibling !== edit) {
        nativeToolbar.insertBefore(this.button, edit);
      }
      this.toolbar?.remove();
      this.toolbar = null;
      return;
    }
    if (!this.toolbar || !this.host.contains(this.toolbar)) {
      this.toolbar?.remove();
      this.toolbar = this.host.createDiv({ cls: "obsidian-math-chords-tikz-block-actions" });
    }
    this.toolbar.classList.toggle("has-edit-button", Boolean(edit));
    if (this.button.parentElement !== this.toolbar) this.toolbar.appendChild(this.button);
  }

  private async export(): Promise<void> {
    if (this.destroyed || this.button.disabled) return;
    // Capture the clicked diagram before the save dialog can change editor focus.
    const data = this.getExportData();
    if (!data) return;
    this.button.disabled = true;
    try {
      await exportTikzPreview(data);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not export the diagram.");
    } finally {
      if (!this.destroyed) this.button.disabled = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.observer.disconnect();
    this.button.remove();
    this.toolbar?.remove();
    this.toolbar = null;
    this.host.classList.remove("obsidian-math-chords-tikz-block");
  }
}
