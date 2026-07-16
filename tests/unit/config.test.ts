import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  parseYaml: (yaml: string) => {
    if (yaml === "not: an-array") return { not: "an-array" };
    if (yaml.includes('keys: "G A"')) {
      return [
        { keys: "G A", command: "\\alpha" },
        { keys: "Ctrl+Alt", command: "x" },
      ];
    }
    if (yaml === "duplicates") {
      return [
        { keys: "Control+A", command: "first" },
        { keys: "Ctrl+A", command: "second" },
      ];
    }
    return [];
  },
  stringifyYaml: (value: unknown) => JSON.stringify(value),
}));
import {
  loadShortcuts,
  mergeShortcuts,
  parseShortcutsYaml,
  shortcutSequenceKey,
  validateShortcut,
} from "../../src/config";
import { DEFAULT_SHORTCUTS } from "../../src/defaults";

describe("shortcut validation", () => {
  it("keeps the complete default catalog valid and canonically unique", () => {
    const sequences = DEFAULT_SHORTCUTS.map((shortcut) => {
      expect(validateShortcut(shortcut)).not.toBeNull();
      return shortcutSequenceKey(shortcut);
    });
    expect(new Set(sequences).size).toBe(DEFAULT_SHORTCUTS.length);
  });

  it("rejects partially valid key sequences instead of truncating them", () => {
    expect(validateShortcut({ keys: "G Ctrl+Alt", command: "\\alpha" })).toBeNull();
  });

  it("rejects empty commands", () => {
    expect(validateShortcut({ keys: "G A", command: "   " })).toBeNull();
  });

  it("keeps complete modifier sequences", () => {
    expect(validateShortcut({ keys: "Ctrl+A", command: "\\alpha" })).toMatchObject({
      keys: "Ctrl+A",
      command: "\\alpha",
    });
  });
});

describe("shortcut merge identity", () => {
  it("canonicalizes modifier aliases", () => {
    expect(shortcutSequenceKey({ keys: "Control+A", command: "x" })).toBe("ctrl+a");
  });

  it("does not merge a default whose canonical sequence already exists", () => {
    const existing = [{ keys: "Control+A", command: "custom" }];
    const defaults = [{ keys: "Ctrl+A", command: "default" }];
    expect(mergeShortcuts(existing, defaults)).toEqual({ merged: existing, added: [] });
  });
});

describe("shortcut loading safety", () => {
  it("rejects malformed documents instead of treating them as empty", () => {
    expect(() => parseShortcutsYaml("not: an-array")).toThrow(/YAML array/);
  });

  it("rejects a document containing any invalid entry", () => {
    expect(() =>
      parseShortcutsYaml('- keys: "G A"\n  command: "\\\\alpha"\n- keys: "Ctrl+Alt"\n  command: x\n'),
    ).toThrow(/entry 2/);
  });

  it("rejects duplicate canonical key sequences", () => {
    expect(() => parseShortcutsYaml("duplicates")).toThrow(/duplicates key sequence/);
  });

  it("does not overwrite an invalid existing file", async () => {
    const write = vi.fn<(content: string) => Promise<void>>();
    await expect(loadShortcuts(async () => "not: an-array", write)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it("seeds defaults only when the file is missing", async () => {
    const write = vi.fn(async (_content: string) => undefined);
    const result = await loadShortcuts(async () => null, write);
    expect(result.shortcuts.length).toBeGreaterThan(0);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
