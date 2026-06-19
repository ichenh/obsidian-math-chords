import { parseYaml, stringifyYaml } from "obsidian";
import { parseKeysField } from "./keys";
import { DEFAULT_SHORTCUTS } from "./defaults";
import type { Shortcut } from "./types";

export interface LoadShortcutsResult {
  shortcuts: Shortcut[];
  mergedCount: number;
}

export function shortcutSequenceKey(shortcut: Shortcut): string {
  return shortcut.keys.trim().toLowerCase();
}

/** Keep existing entries; append defaults whose key sequence is not yet present. */
export function mergeShortcuts(
  existing: Shortcut[],
  defaults: Shortcut[],
): { merged: Shortcut[]; added: Shortcut[] } {
  const seen = new Set(existing.map(shortcutSequenceKey));
  const added: Shortcut[] = [];

  for (const shortcut of defaults) {
    const key = shortcutSequenceKey(shortcut);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(shortcut);
  }

  return { merged: [...existing, ...added], added };
}

/** Collapse YAML-style doubled backslashes before LaTeX control sequences. */
export function normalizeCommand(command: string): string {
  let result = command;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/\\(\\(?:[a-zA-Z]|[{}[\]().|&%#^_~]))/g, "$1");
  } while (result !== prev);
  return result;
}

export function validateShortcut(raw: unknown): Shortcut | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.keys !== "string" || typeof entry.command !== "string") return null;
  if (parseKeysField(entry.keys).length === 0) return null;

  return {
    keys: entry.keys.trim(),
    command: normalizeCommand(entry.command),
    name: typeof entry.name === "string" ? entry.name : undefined,
    group: typeof entry.group === "string" ? entry.group : undefined,
  };
}

export function parseShortcutsYaml(yaml: string): Shortcut[] {
  if (!yaml.trim()) return [];
  const data: unknown = parseYaml(yaml);
  if (!Array.isArray(data)) return [];
  return data.map(validateShortcut).filter((shortcut): shortcut is Shortcut => shortcut !== null);
}

export function stringifyShortcutsYaml(shortcuts: Shortcut[]): string {
  return stringifyYaml(shortcuts);
}

export async function loadShortcuts(
  read: () => Promise<string>,
  write: (content: string) => Promise<void>,
): Promise<LoadShortcutsResult> {
  try {
    const yaml = await read();
    const shortcuts = parseShortcutsYaml(yaml);
    if (shortcuts.length > 0) {
      const { merged, added } = mergeShortcuts(shortcuts, DEFAULT_SHORTCUTS);
      if (added.length > 0) {
        try {
          await write(stringifyShortcutsYaml(merged));
        } catch (error) {
          console.error("Math Chords: could not merge shortcuts into shortcuts.yaml.", error);
          return { shortcuts, mergedCount: 0 };
        }
        return { shortcuts: merged, mergedCount: added.length };
      }
      return { shortcuts, mergedCount: 0 };
    }
  } catch {
    // Missing or unreadable file — seed defaults below.
  }

  const seeded = stringifyShortcutsYaml(DEFAULT_SHORTCUTS);
  try {
    await write(seeded);
  } catch (error) {
    console.error("Math Chords: could not write default shortcuts.yaml.", error);
    return { shortcuts: [...DEFAULT_SHORTCUTS], mergedCount: 0 };
  }
  return { shortcuts: [...DEFAULT_SHORTCUTS], mergedCount: 0 };
}

export async function saveShortcuts(
  write: (content: string) => Promise<void>,
  shortcuts: Shortcut[],
): Promise<void> {
  await write(stringifyShortcutsYaml(shortcuts));
}
