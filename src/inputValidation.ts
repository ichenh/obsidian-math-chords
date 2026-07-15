import type { MathEnvironment } from "./types";

/** Collapse YAML-style doubled backslashes before LaTeX control sequences. */
export function normalizeCommand(command: string): string {
  let result = command;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/\\(\\(?:[a-zA-Z]|[{}[\]().|&%#^_~]))/g, "$1");
  } while (result !== previous);
  return result;
}

export function validateMathEnvironment(raw: unknown): MathEnvironment | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.name !== "string" || !entry.name.trim()) return null;
  if (typeof entry.begin !== "string" || !entry.begin.trim()) return null;
  if (typeof entry.end !== "string" || !entry.end.trim()) return null;

  return {
    name: entry.name.trim(),
    begin: normalizeCommand(entry.begin),
    end: normalizeCommand(entry.end),
  };
}
