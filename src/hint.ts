import type { EditorView } from "@codemirror/view";
import { formatToken, formatSequence } from "./keys";
import { listHints, type TrieNode } from "./trie";
import type { Shortcut } from "./types";

export class HintPopup {
  private readonly rootEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly listEl: HTMLElement;

  constructor() {
    this.rootEl = document.body.createDiv({ cls: "obsidian-math-chords-hint-popup" });
    this.titleEl = this.rootEl.createDiv({ cls: "obsidian-math-chords-hint-title" });
    this.listEl = this.rootEl.createDiv({ cls: "obsidian-math-chords-hint-list" });
    this.hide();
  }

  show(
    view: EditorView,
    node: TrieNode,
    sequence: string[],
    leaderKey: string,
    pending?: Shortcut | null,
  ): void {
    this.rootEl.removeClass("is-hidden");
    this.titleEl.setText(formatSequence(sequence, leaderKey));
    this.listEl.empty();

    const hints = listHints(node);

    if (pending) {
      const row = this.listEl.createDiv({ cls: "obsidian-math-chords-hint-row is-pending" });
      row.createSpan({ cls: "obsidian-math-chords-hint-key", text: "Enter" });
      row.createSpan({ cls: "obsidian-math-chords-hint-label", text: pending.name ?? pending.command });
      row.createSpan({ cls: "obsidian-math-chords-hint-command", text: pending.command });
    }

    if (hints.length === 0 && !pending) {
      this.listEl.createDiv({ cls: "obsidian-math-chords-hint-empty", text: "No further shortcuts" });
    }

    for (const hint of hints) {
      const row = this.listEl.createDiv({ cls: "obsidian-math-chords-hint-row" });
      row.createSpan({ cls: "obsidian-math-chords-hint-key", text: formatToken(hint.token) });
      const label = hint.shortcut?.name ?? (hint.shortcut ? hint.shortcut.command : "…");
      row.createSpan({ cls: "obsidian-math-chords-hint-label", text: label });
      if (hint.shortcut) {
        row.createSpan({ cls: "obsidian-math-chords-hint-command", text: hint.shortcut.command });
      }
    }

    this.position(view);
  }

  hide(): void {
    this.rootEl.addClass("is-hidden");
  }

  destroy(): void {
    this.rootEl.remove();
  }

  private position(view: EditorView): void {
    const head = view.state.selection.main.head;
    const coords = view.coordsAtPos(head);
    if (!coords) return;

    this.rootEl.style.top = `${coords.bottom + 8}px`;
    this.rootEl.style.left = `${coords.left}px`;
  }
}
