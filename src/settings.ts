import type { MathEnvironment } from "./types";
import { validateMathEnvironment } from "./mathEnv";

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
  leaderKey: string;
  wrapOutsideMath: boolean;
  mathEnvWrapEnabled: boolean;
  mathEnvWrapKeys: string;
  mathEnvironments: MathEnvironment[];
}

export const DEFAULT_SETTINGS: ObsidianMathChordsSettings = {
  enabled: true,
  showHintPopup: false,
  showInlinePreview: true,
  leaderKey: "Alt+M",
  wrapOutsideMath: true,
  mathEnvWrapEnabled: true,
  mathEnvWrapKeys: "Shift+E",
  mathEnvironments: DEFAULT_MATH_ENVIRONMENTS.map((env) => ({ ...env })),
};

export function normalizeSettings(data: Record<string, unknown> | null): ObsidianMathChordsSettings {
  const raw = { ...DEFAULT_SETTINGS, ...(data ?? {}) };

  const environments = Array.isArray(raw.mathEnvironments)
    ? raw.mathEnvironments
        .map((entry) => validateMathEnvironment(entry))
        .filter((entry): entry is MathEnvironment => entry !== null)
    : [];

  return {
    enabled: raw.enabled !== false,
    showHintPopup: raw.showHintPopup === true,
    showInlinePreview: raw.showInlinePreview !== false,
    leaderKey: typeof raw.leaderKey === "string" && raw.leaderKey.trim() ? raw.leaderKey.trim() : DEFAULT_SETTINGS.leaderKey,
    wrapOutsideMath: raw.wrapOutsideMath !== false,
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
