import type {
  FormulaPanelSectionId,
  FormulaTemplateNode,
  MathEnvironment,
} from "./types";
import { normalizeFormulaTemplateNodes } from "./formulaTemplateModel";
import { isValidChord, isValidKeySequence } from "./keys";
import { validateMathEnvironment } from "./inputValidation";

export const DEFAULT_MATH_BRACE_NAV_NEXT = "Alt+ArrowRight";
export const DEFAULT_MATH_BRACE_NAV_PREV = "Alt+ArrowLeft";
export const SETTINGS_SCHEMA_VERSION = 6;
export const FORMULA_PANEL_ENVIRONMENT_GROUP_ID = "__math_environments__";

export const DEFAULT_FORMULA_PANEL_GROUP_ORDER = [
  "Structures",
  FORMULA_PANEL_ENVIRONMENT_GROUP_ID,
  "Greek",
  "Operators",
  "Delimiters",
  "Accents",
  "Arrows",
  "Matrices",
  "Fonts",
];
export const DEFAULT_FORMULA_PANEL_SECTION_ORDER: FormulaPanelSectionId[] = [
  "shortcuts",
  "templates",
];

function isValidNavChord(chord: string): boolean {
  return isValidChord(chord);
}

function normalizeNavKey(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed && isValidNavChord(trimmed) ? trimmed : fallback;
}

export function normalizeChordSetting(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return isValidChord(trimmed) ? trimmed : fallback;
}

export function normalizeSequenceSetting(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return isValidKeySequence(trimmed) ? trimmed : fallback;
}

export const DEFAULT_MATH_ENVIRONMENTS: MathEnvironment[] = [
  { name: "aligned", begin: "\\begin{aligned}", end: "\\end{aligned}" },
  { name: "matrix", begin: "\\begin{matrix}", end: "\\end{matrix}" },
  { name: "cases", begin: "\\begin{cases}", end: "\\end{cases}" },
  { name: "gathered", begin: "\\begin{gathered}", end: "\\end{gathered}" },
];

export interface ObsidianMathChordsSettings {
  schemaVersion: number;
  enabled: boolean;
  showHintPopup: boolean;
  showInlinePreview: boolean;
  formulaPanelEnabled: boolean;
  mathBraceNavEnabled: boolean;
  mathBraceNavNextKey: string;
  mathBraceNavPrevKey: string;
  leaderKey: string;
  wrapOutsideMath: boolean;
  smartMathToggle: boolean;
  autoConvertPastedLatexDelimiters: boolean;
  mathEnvWrapEnabled: boolean;
  mathEnvWrapKeys: string;
  mathEnvironments: MathEnvironment[];
  formulaPanelGroupOrder: string[];
  formulaPanelCollapsedGroups: string[];
  formulaPanelSectionOrder: FormulaPanelSectionId[];
  formulaPanelCollapsedSections: FormulaPanelSectionId[];
  formulaPanelTemplates: FormulaTemplateNode[];
  settingsCollapsedManagementSections: string[];
  settingsCollapsedShortcutGroups: string[];
  settingsCollapsedTemplateFolders: string[];
}

export const DEFAULT_SETTINGS: ObsidianMathChordsSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  enabled: true,
  showHintPopup: true,
  showInlinePreview: true,
  formulaPanelEnabled: true,
  mathBraceNavEnabled: true,
  mathBraceNavNextKey: DEFAULT_MATH_BRACE_NAV_NEXT,
  mathBraceNavPrevKey: DEFAULT_MATH_BRACE_NAV_PREV,
  leaderKey: "Alt+M",
  wrapOutsideMath: true,
  smartMathToggle: true,
  autoConvertPastedLatexDelimiters: false,
  mathEnvWrapEnabled: true,
  mathEnvWrapKeys: "Shift+E",
  mathEnvironments: DEFAULT_MATH_ENVIRONMENTS.map((env) => ({ ...env })),
  formulaPanelGroupOrder: [...DEFAULT_FORMULA_PANEL_GROUP_ORDER],
  formulaPanelCollapsedGroups: [],
  formulaPanelSectionOrder: [...DEFAULT_FORMULA_PANEL_SECTION_ORDER],
  formulaPanelCollapsedSections: [],
  formulaPanelTemplates: [],
  settingsCollapsedManagementSections: [],
  settingsCollapsedShortcutGroups: [],
  settingsCollapsedTemplateFolders: [],
};

function normalizeStringList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const values = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim());
  return [...new Set(values)];
}

function normalizeFormulaPanelSectionList(
  raw: unknown,
  fallback: FormulaPanelSectionId[],
): FormulaPanelSectionId[] {
  const values = normalizeStringList(raw, fallback).filter(
    (value): value is FormulaPanelSectionId => value === "shortcuts" || value === "templates",
  );
  return [...values, ...fallback.filter((value) => !values.includes(value))];
}

export function migrateSettingsData(
  data: Record<string, unknown> | null,
): Record<string, unknown> {
  const migrated = { ...(data ?? {}) };
  const savedSchema = typeof migrated.schemaVersion === "number" ? migrated.schemaVersion : 0;
  if (typeof migrated.mathBraceNavEnabled !== "boolean") {
    migrated.mathBraceNavEnabled = migrated.snippetTabStops;
  }
  if (typeof migrated.mathBraceNavNextKey !== "string") {
    migrated.mathBraceNavNextKey = migrated.placeholderNavNextKey;
  }
  if (typeof migrated.mathBraceNavPrevKey !== "string") {
    migrated.mathBraceNavPrevKey = migrated.placeholderNavPrevKey;
  }
  delete migrated.snippetTabStops;
  delete migrated.placeholderNavNextKey;
  delete migrated.placeholderNavPrevKey;
  if (
    savedSchema > 0 &&
    savedSchema < 3 &&
    Array.isArray(migrated.formulaPanelGroupOrder) &&
    !migrated.formulaPanelGroupOrder.includes(FORMULA_PANEL_ENVIRONMENT_GROUP_ID)
  ) {
    const order = migrated.formulaPanelGroupOrder.filter(
      (entry): entry is string => typeof entry === "string",
    );
    const structuresAt = order.indexOf("Structures");
    order.splice(structuresAt >= 0 ? structuresAt + 1 : 0, 0, FORMULA_PANEL_ENVIRONMENT_GROUP_ID);
    migrated.formulaPanelGroupOrder = order;
  }
  migrated.schemaVersion = SETTINGS_SCHEMA_VERSION;
  return migrated;
}

export function normalizeSettings(data: Record<string, unknown> | null): ObsidianMathChordsSettings {
  const migrated = migrateSettingsData(data);
  const raw = { ...DEFAULT_SETTINGS, ...migrated };

  const savedEnvironments = Array.isArray(migrated.mathEnvironments)
    ? migrated.mathEnvironments
    : null;
  const validSavedEnvironments = savedEnvironments
    ? savedEnvironments
        .map((entry) => validateMathEnvironment(entry))
        .filter((entry): entry is MathEnvironment => entry !== null)
    : null;
  const environments =
    savedEnvironments?.length === 0
      ? []
      : validSavedEnvironments && validSavedEnvironments.length > 0
        ? validSavedEnvironments
        : DEFAULT_MATH_ENVIRONMENTS.map((env) => ({ ...env }));

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: raw.enabled !== false,
    showHintPopup: raw.showHintPopup !== false,
    showInlinePreview: raw.showInlinePreview !== false,
    formulaPanelEnabled: raw.formulaPanelEnabled !== false,
    mathBraceNavEnabled:
      typeof migrated.mathBraceNavEnabled === "boolean"
        ? migrated.mathBraceNavEnabled
        : DEFAULT_SETTINGS.mathBraceNavEnabled,
    mathBraceNavNextKey: normalizeNavKey(
      raw.mathBraceNavNextKey,
      DEFAULT_MATH_BRACE_NAV_NEXT,
    ),
    mathBraceNavPrevKey: normalizeNavKey(
      raw.mathBraceNavPrevKey,
      DEFAULT_MATH_BRACE_NAV_PREV,
    ),
    leaderKey: normalizeChordSetting(raw.leaderKey, DEFAULT_SETTINGS.leaderKey),
    wrapOutsideMath: raw.wrapOutsideMath !== false,
    smartMathToggle: raw.smartMathToggle !== false,
    autoConvertPastedLatexDelimiters: raw.autoConvertPastedLatexDelimiters === true,
    mathEnvWrapEnabled: raw.mathEnvWrapEnabled !== false,
    mathEnvWrapKeys: normalizeSequenceSetting(
      raw.mathEnvWrapKeys,
      DEFAULT_SETTINGS.mathEnvWrapKeys,
    ),
    mathEnvironments: environments,
    formulaPanelGroupOrder: normalizeStringList(
      raw.formulaPanelGroupOrder,
      DEFAULT_SETTINGS.formulaPanelGroupOrder,
    ),
    formulaPanelCollapsedGroups: normalizeStringList(
      raw.formulaPanelCollapsedGroups,
      DEFAULT_SETTINGS.formulaPanelCollapsedGroups,
    ),
    formulaPanelSectionOrder: normalizeFormulaPanelSectionList(
      raw.formulaPanelSectionOrder,
      DEFAULT_SETTINGS.formulaPanelSectionOrder,
    ),
    formulaPanelCollapsedSections: normalizeFormulaPanelSectionList(
      raw.formulaPanelCollapsedSections,
      [],
    ),
    formulaPanelTemplates: normalizeFormulaTemplateNodes(raw.formulaPanelTemplates),
    settingsCollapsedManagementSections: normalizeStringList(
      raw.settingsCollapsedManagementSections,
      DEFAULT_SETTINGS.settingsCollapsedManagementSections,
    ).filter((value) => value === "shortcuts" || value === "templates"),
    settingsCollapsedShortcutGroups: normalizeStringList(
      raw.settingsCollapsedShortcutGroups,
      DEFAULT_SETTINGS.settingsCollapsedShortcutGroups,
    ),
    settingsCollapsedTemplateFolders: normalizeStringList(
      raw.settingsCollapsedTemplateFolders,
      DEFAULT_SETTINGS.settingsCollapsedTemplateFolders,
    ),
  };
}
