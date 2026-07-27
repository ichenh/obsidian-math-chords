import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_FORMULA_PANEL_GROUP_ORDER,
  FORMULA_PANEL_ENVIRONMENT_GROUP_ID,
  migrateSettingsData,
  normalizeChordSetting,
  normalizeSequenceSetting,
  normalizeSettings,
  normalizeTikzCodeBlockLanguage,
  normalizeTikzDebounceMs,
  normalizeTikzFontName,
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
    expect(normalizeSettings(null).formulaPanelRecentTemplateIds).toEqual([]);
    expect(normalizeSettings(null).settingsCollapsedManagementSections).toEqual([]);
    expect(normalizeSettings(null)).toMatchObject({
      tikzRenderingEnabled: false,
      tikzLivePreview: false,
      tikzCodeBlockLanguage: "tikz",
      tikzBackend: "wasm",
      tikzDebounceMs: 250,
      tikzNativeEnginePath: "",
      tikzCustomFontsEnabled: false,
      tikzLatinFont: "",
      tikzSimplifiedChineseFont: "",
      tikzTraditionalChineseFont: "",
      tikzJapaneseFont: "",
      tikzKoreanFont: "",
    });
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

  it("normalizes opt-in TikZ settings without enabling rendering implicitly", () => {
    const settings = normalizeSettings({
      tikzRenderingEnabled: "yes",
      tikzLivePreview: false,
      tikzCodeBlockLanguage: " TikZ-Math-Chords ",
      tikzBackend: "native",
      tikzDebounceMs: 15,
      tikzNativeEnginePath: " C:\\texlive\\bin\\latex.exe ",
    });
    expect(settings).toMatchObject({
      tikzRenderingEnabled: false,
      tikzLivePreview: false,
      tikzCodeBlockLanguage: "tikz-math-chords",
      tikzBackend: "native",
      tikzDebounceMs: 50,
      tikzNativeEnginePath: "C:\\texlive\\bin\\latex.exe",
    });
    expect(normalizeTikzCodeBlockLanguage("bad language!")).toBe("tikz");
    expect(normalizeTikzDebounceMs(10_000)).toBe(1_000);
  });

  it("keeps TikZ editor preview opt-in", () => {
    expect(normalizeSettings({ tikzLivePreview: true }).tikzLivePreview).toBe(
      true,
    );
    expect(normalizeSettings({}).tikzLivePreview).toBe(false);
  });

  it("migrates the previous live-preview delay without replacing custom values", () => {
    expect(normalizeSettings({
      schemaVersion: 8,
      tikzDebounceMs: 120,
    }).tikzDebounceMs).toBe(250);
    expect(normalizeSettings({
      schemaVersion: 8,
      tikzDebounceMs: 350,
    }).tikzDebounceMs).toBe(350);
    expect(normalizeSettings({
      schemaVersion: 10,
      tikzDebounceMs: 500,
    }).tikzDebounceMs).toBe(250);
    expect(normalizeSettings({
      schemaVersion: 10,
      tikzDebounceMs: 700,
    }).tikzDebounceMs).toBe(700);
  });

  it("normalizes custom TikZ font family names", () => {
    expect(normalizeTikzFontName("  Source   Han Serif JP  ")).toBe(
      "Source Han Serif JP",
    );
    expect(normalizeTikzFontName("Noto Serif CJK KR\\input{bad}")).toBe("");
    expect(normalizeTikzFontName("Bad%font")).toBe("");
    expect(normalizeSettings({
      tikzJapaneseFont: "  Yu Mincho  ",
      tikzKoreanFont: "Bad{font}",
    })).toMatchObject({
      tikzCustomFontsEnabled: true,
      tikzJapaneseFont: "Yu Mincho",
      tikzKoreanFont: "",
    });
    expect(normalizeSettings({
      tikzCustomFontsEnabled: false,
      tikzJapaneseFont: "Yu Mincho",
    }).tikzCustomFontsEnabled).toBe(false);
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

  it("keeps bounded recent template IDs and removes stale entries", () => {
    const settings = normalizeSettings({
      formulaPanelTemplates: [
        {
          id: "a",
          type: "template",
          name: "A",
          content: "$a$",
        },
        {
          id: "b",
          type: "template",
          name: "B",
          content: "$b$",
        },
      ],
      formulaPanelRecentTemplateIds: [
        "b",
        "missing",
        "a",
        "b",
        ...Array.from({ length: 20 }, (_, index) => `missing-${index}`),
      ],
    });

    expect(settings.formulaPanelRecentTemplateIds).toEqual(["b", "a"]);
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
