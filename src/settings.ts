import type { MathEnvironment } from "./types";
import { parseChord } from "./keys";
import { validateMathEnvironment } from "./mathEnv";

export const DEFAULT_MATH_BRACE_NAV_NEXT = "Alt+ArrowRight";
export const DEFAULT_MATH_BRACE_NAV_PREV = "Alt+ArrowLeft";

function isValidNavChord(chord: string): boolean {
  const parsed = parseChord(chord);
  if (!parsed) return false;
  const parts = parsed.split("+");
  const base = parts[parts.length - 1];
  return base.length > 0 && !["ctrl", "alt", "shift", "meta"].includes(base);
}

function normalizeNavKey(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed && isValidNavChord(trimmed) ? trimmed : fallback;
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
  mathEnvWrapEnabled: true,
  mathEnvWrapKeys: "Shift+E",
  mathEnvironments: DEFAULT_MATH_ENVIRONMENTS.map((env) => ({ ...env })),
};

export function normalizeSettings(data: Record<string, unknown> | null): ObsidianMathChordsSettings {
  const legacy = data ?? {};
  const raw = { ...DEFAULT_SETTINGS, ...legacy };

  const environments = Array.isArray(raw.mathEnvironments)
    ? raw.mathEnvironments
        .map((entry) => validateMathEnvironment(entry))
        .filter((entry): entry is MathEnvironment => entry !== null)
    : [];

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
    leaderKey: typeof raw.leaderKey === "string" && raw.leaderKey.trim() ? raw.leaderKey.trim() : DEFAULT_SETTINGS.leaderKey,
    wrapOutsideMath: raw.wrapOutsideMath !== false,
    smartMathToggle: raw.smartMathToggle !== false,
    mathEnvWrapEnabled: raw.mathEnvWrapEnabled !== false,
    mathEnvWrapKeys:
      typeof raw.mathEnvWrapKeys === "string" && raw.mathEnvWrapKeys.trim()
        ? raw.mathEnvWrapKeys.trim()
        : DEFAULT_SETTINGS.mathEnvWrapKeys,
    mathEnvironments:
      environments.length > 0
        ? environments
        : DEFAULT_MATH_ENVIRONMENTS.map((env) => ({ ...env })),
  };
}
