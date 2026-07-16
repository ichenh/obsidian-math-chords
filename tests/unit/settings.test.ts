import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeChordSetting,
  normalizeSequenceSetting,
  normalizeSettings,
} from "../../src/settings";

describe("settings normalization", () => {
  it("falls back from incomplete key settings", () => {
    expect(normalizeChordSetting("Ctrl+Alt", "Alt+M")).toBe("Alt+M");
    expect(normalizeSequenceSetting("Shift+E Ctrl+Alt", "Shift+E")).toBe("Shift+E");
  });

  it("keeps complete chords and sequences", () => {
    expect(normalizeChordSetting("Ctrl+Alt+M", "Alt+M")).toBe("Ctrl+Alt+M");
    expect(normalizeSequenceSetting("G Shift+A", "Shift+E")).toBe("G Shift+A");
  });

  it("normalizes invalid persisted key settings", () => {
    const settings = normalizeSettings({ leaderKey: "Alt", mathEnvWrapKeys: "Ctrl+Alt" });
    expect(settings.leaderKey).toBe(DEFAULT_SETTINGS.leaderKey);
    expect(settings.mathEnvWrapKeys).toBe(DEFAULT_SETTINGS.mathEnvWrapKeys);
  });

  it("preserves an intentionally empty environment list", () => {
    expect(normalizeSettings({ mathEnvironments: [] }).mathEnvironments).toEqual([]);
  });

  it("falls back when a non-empty saved environment list is entirely invalid", () => {
    expect(normalizeSettings({ mathEnvironments: [{ name: "broken" }] }).mathEnvironments).toEqual(
      DEFAULT_SETTINGS.mathEnvironments,
    );
  });
});
