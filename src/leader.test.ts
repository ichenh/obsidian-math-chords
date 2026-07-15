import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  getLanguage: () => "en",
  normalizePath: (path: string) => path,
}));
import type { HintPopup } from "./hint";
import { LeaderController } from "./leader";
import { buildTrie } from "./trie";

function keyEvent(
  key: string,
  overrides: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    ...overrides,
  } as KeyboardEvent;
}

function controller(onCommit = vi.fn()) {
  const hint = {
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
  } as unknown as HintPopup;
  const instance = new LeaderController(
    {
      isEnabled: () => true,
      getLeaderKey: () => "Alt+M",
      getTrie: () =>
        buildTrie([
          { keys: "F", command: "\\frac{$$}{}" },
          { keys: "Ctrl+A", command: "\\alpha" },
        ]),
      shouldShowHints: () => false,
      onCommit,
      onNotice: vi.fn(),
    },
    hint,
  );
  return { instance, onCommit };
}

const view = {} as EditorView;

describe("LeaderController", () => {
  it("ignores composing input", () => {
    const { instance } = controller();
    expect(instance.handleKeyDown(keyEvent("m", { altKey: true, isComposing: true }), view)).toBe(
      false,
    );
    expect(instance.isArmed()).toBe(false);
  });

  it("cancels an armed sequence when IME composition starts", () => {
    const { instance } = controller();
    instance.handleKeyDown(keyEvent("m", { altKey: true }), view);
    expect(instance.isArmed()).toBe(true);
    expect(instance.handleKeyDown(keyEvent("Process", { isComposing: true }), view)).toBe(false);
    expect(instance.isArmed()).toBe(false);
  });

  it("consumes key repeats without resetting an armed sequence", () => {
    const { instance, onCommit } = controller();
    expect(instance.handleKeyDown(keyEvent("m", { altKey: true }), view)).toBe(true);
    expect(instance.handleKeyDown(keyEvent("m", { altKey: true, repeat: true }), view)).toBe(true);
    expect(instance.handleKeyDown(keyEvent("f"), view)).toBe(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits configured modifier chords after the leader", () => {
    const { instance, onCommit } = controller();
    instance.handleKeyDown(keyEvent("m", { altKey: true }), view);
    expect(instance.handleKeyDown(keyEvent("a", { ctrlKey: true }), view)).toBe(true);
    expect(onCommit).toHaveBeenCalledWith(view, expect.objectContaining({ command: "\\alpha" }));
  });
});
