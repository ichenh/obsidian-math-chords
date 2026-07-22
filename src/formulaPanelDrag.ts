import type { MathEnvironment, Shortcut } from "./types";

export const FORMULA_PANEL_INSERT_MIME =
  "application/x-math-chords-formula-panel-insert";

export type FormulaPanelDragPayload =
  | { kind: "shortcut"; shortcut: Shortcut }
  | { kind: "environment"; environment: MathEnvironment }
  | { kind: "template"; content: string };

export function encodeFormulaPanelDragPayload(
  payload: FormulaPanelDragPayload,
): string {
  return JSON.stringify(payload);
}

export function decodeFormulaPanelDragPayload(
  encoded: string,
): FormulaPanelDragPayload | null {
  if (!encoded) return null;
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (record.kind === "template") {
    return typeof record.content === "string"
      ? { kind: "template", content: record.content }
      : null;
  }

  if (record.kind === "shortcut" && isRecord(record.shortcut)) {
    const shortcut = record.shortcut;
    if (typeof shortcut.keys !== "string" || typeof shortcut.command !== "string") {
      return null;
    }
    if (shortcut.name !== undefined && typeof shortcut.name !== "string") return null;
    if (shortcut.group !== undefined && typeof shortcut.group !== "string") return null;
    return {
      kind: "shortcut",
      shortcut: {
        keys: shortcut.keys,
        command: shortcut.command,
        ...(typeof shortcut.name === "string" ? { name: shortcut.name } : {}),
        ...(typeof shortcut.group === "string" ? { group: shortcut.group } : {}),
      },
    };
  }

  if (record.kind === "environment" && isRecord(record.environment)) {
    const environment = record.environment;
    if (
      typeof environment.name !== "string" ||
      typeof environment.begin !== "string" ||
      typeof environment.end !== "string"
    ) {
      return null;
    }
    return {
      kind: "environment",
      environment: {
        name: environment.name,
        begin: environment.begin,
        end: environment.end,
      },
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
