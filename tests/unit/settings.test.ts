import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_FORMULA_PANEL_GROUP_ORDER,
  FORMULA_PANEL_ENVIRONMENT_GROUP_ID,
  migrateSettingsData,
  normalizeChordSetting,
  normalizeSequenceSetting,
  normalizeSettings,
  SETTINGS_SCHEMA_VERSION,
} from "../../src/settings";

describe("settings normalization", () => {
  it("assigns the current schema to old or missing settings", () => {
    expect(normalizeSettings(null).schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(normalizeSettings(null).formulaPanelEnabled).toBe(true);
    expect(normalizeSettings(null).formulaPanelSectionOrder).toEqual([
      "shortcuts",
      "templates",
    ]);
    expect(normalizeSettings(null).formulaPanelTemplates).toEqual([]);
    expect(normalizeSettings(null).settingsCollapsedManagementSections).toEqual([]);
  });

  it("preserves an explicitly disabled formula panel", () => {
    expect(normalizeSettings({ formulaPanelEnabled: false }).formulaPanelEnabled).toBe(false);
  });

  it("migrates legacy brace navigation keys without retaining aliases", () => {
    const migrated = migrateSettingsData({
      snippetTabStops: false,
      placeholderNavNextKey: "Ctrl+ArrowRight",
      placeholderNavPrevKey: "Ctrl+ArrowLeft",
    });

    expect(migrated).toMatchObject({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      mathBraceNavEnabled: false,
      mathBraceNavNextKey: "Ctrl+ArrowRight",
      mathBraceNavPrevKey: "Ctrl+ArrowLeft",
    });
    expect(migrated).not.toHaveProperty("snippetTabStops");
    expect(normalizeSettings(migrated).mathBraceNavEnabled).toBe(false);
  });
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

  it("normalizes formula panel group preferences", () => {
    const settings = normalizeSettings({
      formulaPanelGroupOrder: [" Greek ", "Structures", "Greek", 42],
      formulaPanelCollapsedGroups: ["Operators", "Operators", null],
    });
    expect(settings.formulaPanelGroupOrder).toEqual(["Greek", "Structures"]);
    expect(settings.formulaPanelCollapsedGroups).toEqual(["Operators"]);
    expect(normalizeSettings(null).formulaPanelGroupOrder).toEqual(
      DEFAULT_FORMULA_PANEL_GROUP_ORDER,
    );
  });

  it("normalizes formula panel section state and template data", () => {
    const settings = normalizeSettings({
      formulaPanelSectionOrder: ["templates", "unknown"],
      formulaPanelCollapsedSections: ["templates", "templates", "unknown"],
      formulaPanelTemplates: [{
        id: "folder",
        type: "folder",
        name: "Equations",
        children: [],
      }],
    });
    expect(settings.formulaPanelSectionOrder).toEqual(["templates", "shortcuts"]);
    expect(settings.formulaPanelCollapsedSections).toEqual(["templates"]);
    expect(settings.formulaPanelTemplates[0]).toMatchObject({
      id: "folder",
      type: "folder",
      name: "Equations",
      children: [],
    });
  });

  it("normalizes settings-page collapsed sections and groups", () => {
    const settings = normalizeSettings({
      settingsCollapsedManagementSections: ["templates", "invalid", "templates"],
      settingsCollapsedShortcutGroups: ["Greek", "Greek", 42],
      settingsCollapsedTemplateFolders: ["folder", null, "folder"],
    });
    expect(settings.settingsCollapsedManagementSections).toEqual(["templates"]);
    expect(settings.settingsCollapsedShortcutGroups).toEqual(["Greek"]);
    expect(settings.settingsCollapsedTemplateFolders).toEqual(["folder"]);
  });

  it("adds the environment group when migrating formula panel order", () => {
    const migrated = normalizeSettings({
      schemaVersion: 2,
      formulaPanelGroupOrder: ["Structures", "Greek", "Operators"],
    });
    expect(migrated.formulaPanelGroupOrder).toEqual([
      "Structures",
      FORMULA_PANEL_ENVIRONMENT_GROUP_ID,
      "Greek",
      "Operators",
    ]);
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
