import { EditorView } from "@codemirror/view";
import {
  eventMatchesLeader,
  formatSequence,
  normalizeSequenceKey,
  parseKeysField,
} from "./keys";
import { findNode, hasChildren, type TrieNode } from "./trie";
import type { Shortcut } from "./types";
import { HintPopup } from "./hint";

export interface LeaderContext {
  isEnabled: () => boolean;
  getLeaderKey: () => string;
  getTrie: () => TrieNode;
  shouldShowHints: () => boolean;
  onCommit: (view: EditorView, shortcut: Shortcut) => void;
  onNotice: (message: string) => void;
  isMathEnvWrapEnabled?: () => boolean;
  getMathEnvWrapKeys?: () => string;
  onMathEnvWrap?: (view: EditorView) => void;
}

interface LeaderState {
  armed: boolean;
  sequence: string[];
  pending: Shortcut | null;
}

export class LeaderController {
  private state: LeaderState = { armed: false, sequence: [], pending: null };
  private readonly hint: HintPopup;

  constructor(
    private readonly ctx: LeaderContext,
    hint?: HintPopup,
  ) {
    this.hint = hint ?? new HintPopup();
  }

  destroy(): void {
    this.hint.destroy();
  }

  reset(): void {
    this.state = { armed: false, sequence: [], pending: null };
    this.hint.hide();
  }

  isArmed(): boolean {
    return this.state.armed;
  }

  /** Returns true when the event was consumed. Caller should preventDefault. */
  handleKeyDown(event: KeyboardEvent, view: EditorView): boolean {
    if (!this.ctx.isEnabled()) return false;

    if (this.state.armed) {
      return this.handleArmed(event, view);
    }

    if (eventMatchesLeader(event, this.ctx.getLeaderKey())) {
      this.state = { armed: true, sequence: [], pending: null };
      this.refreshHints(view);
      return true;
    }

    return false;
  }

  private handleArmed(event: KeyboardEvent, view: EditorView): boolean {
    const key = event.key.toLowerCase();

    if (key === "escape") {
      this.reset();
      return true;
    }

    if ((key === "enter" || key === " ") && this.state.pending) {
      this.commit(view, this.state.pending);
      return true;
    }

    const token = normalizeSequenceKey(event);
    if (!token) return false;

    const next = [...this.state.sequence, token];

    if (this.isMathEnvWrapSequence(next)) {
      this.ctx.onMathEnvWrap?.(view);
      this.reset();
      return true;
    }

    const node = findNode(this.ctx.getTrie(), next);
    if (!node) {
      if (this.isMathEnvWrapPrefix(next)) {
        this.state.sequence = next;
        this.refreshHints(view);
        return true;
      }
      this.ctx.onNotice(`Undefined ${formatSequence(next, this.ctx.getLeaderKey())}`);
      this.reset();
      return true;
    }

    this.state.sequence = next;

    if (node.shortcut && hasChildren(node)) {
      this.state.pending = node.shortcut;
      this.refreshHints(view, node);
      return true;
    }

    if (node.shortcut) {
      this.commit(view, node.shortcut);
      return true;
    }

    this.state.pending = null;
    this.refreshHints(view, node);
    return true;
  }

  private commit(view: EditorView, shortcut: Shortcut): void {
    this.ctx.onCommit(view, shortcut);
    this.reset();
  }

  private isMathEnvWrapSequence(sequence: string[]): boolean {
    if (!this.ctx.isMathEnvWrapEnabled?.()) return false;
    if (!this.ctx.onMathEnvWrap) return false;

    const expected = parseKeysField(this.ctx.getMathEnvWrapKeys?.() ?? "");
    if (expected.length === 0 || sequence.length !== expected.length) return false;
    return this.isMathEnvWrapPrefix(sequence, expected);
  }

  private isMathEnvWrapPrefix(sequence: string[], expected?: string[]): boolean {
    if (!this.ctx.isMathEnvWrapEnabled?.()) return false;
    const target = expected ?? parseKeysField(this.ctx.getMathEnvWrapKeys?.() ?? "");
    if (target.length === 0 || sequence.length > target.length) return false;
    return sequence.every((token, index) => token === target[index]);
  }

  private refreshHints(view: EditorView, node?: ReturnType<typeof findNode>): void {
    if (!this.ctx.shouldShowHints()) {
      this.hint.hide();
      return;
    }

    const trieNode = node ?? this.ctx.getTrie();
    this.hint.show(
      view,
      trieNode,
      this.state.sequence,
      this.ctx.getLeaderKey(),
      this.state.pending,
    );
  }
}
