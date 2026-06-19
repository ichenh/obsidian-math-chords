import type { MathEnvironment } from "./types";

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
