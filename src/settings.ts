import type { MathEnvironment } from "./types";
import { isValidChord, isValidKeySequence } from "./keys";
import { validateMathEnvironment } from "./inputValidation";

export const DEFAULT_MATH_BRACE_NAV_NEXT = "Alt+ArrowRight";
export const DEFAULT_MATH_BRACE_NAV_PREV = "Alt+ArrowLeft";

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
  enabled: boolean;
  showHintPopup: boolean;
  showInlinePreview: boolean;
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
}

export const DEFAULT_SETTINGS: ObsidianMathChordsSettings = {
  enabled: true,
  showHintPopup: true,
  showInlinePreview: true,
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
};

export function normalizeSettings(data: Record<string, unknown> | null): ObsidianMathChordsSettings {
  const legacy = data ?? {};
  const raw = { ...DEFAULT_SETTINGS, ...legacy };

  const savedEnvironments = Array.isArray(legacy.mathEnvironments)
    ? legacy.mathEnvironments
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
    enabled: raw.enabled !== false,
    showHintPopup: raw.showHintPopup !== false,
    showInlinePreview: raw.showInlinePreview !== false,
    mathBraceNavEnabled:
      typeof legacy.mathBraceNavEnabled === "boolean"
        ? legacy.mathBraceNavEnabled
        : typeof legacy.snippetTabStops === "boolean"
          ? legacy.snippetTabStops
          : DEFAULT_SETTINGS.mathBraceNavEnabled,
    mathBraceNavNextKey: normalizeNavKey(
      raw.mathBraceNavNextKey ?? legacy.placeholderNavNextKey,
      DEFAULT_MATH_BRACE_NAV_NEXT,
    ),
    mathBraceNavPrevKey: normalizeNavKey(
      raw.mathBraceNavPrevKey ?? legacy.placeholderNavPrevKey,
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
  };
}
