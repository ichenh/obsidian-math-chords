import { describe, expect, it } from "vitest";
import { buildTrie, findNode, hasChildren, shortcutStorageKey } from "../../src/trie";
import type { Shortcut } from "../../src/types";

describe("buildTrie", () => {
  const shortcuts: Shortcut[] = [
    { keys: "F", command: "\\frac{$$}{}" },
    { keys: "G A", command: "\\alpha" },
    { keys: "G", command: "\\gamma" },
  ];

  it("resolves exact key sequences", () => {
    const root = buildTrie(shortcuts);
    expect(findNode(root, ["f"])?.shortcut?.command).toBe("\\frac{$$}{}");
    expect(findNode(root, ["g", "a"])?.shortcut?.command).toBe("\\alpha");
  });

  it("keeps prefix nodes with children", () => {
    const root = buildTrie(shortcuts);
    const gNode = findNode(root, ["g"]);
    expect(gNode?.shortcut?.command).toBe("\\gamma");
    expect(hasChildren(gNode!)).toBe(true);
  });
});

describe("shortcutStorageKey", () => {
  it("normalizes keys for map storage", () => {
    expect(shortcutStorageKey({ keys: " Shift+F ", command: "\\foo" })).toBe(
      "shift+f",
    );
  });

  it("uses the canonical sequence rather than the command as identity", () => {
    expect(shortcutStorageKey({ keys: "Control+A", command: "\\alpha" })).toBe("ctrl+a");
    expect(shortcutStorageKey({ keys: "Ctrl+A", command: "\\beta" })).toBe("ctrl+a");
  });
});
