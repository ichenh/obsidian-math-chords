import { parseYaml, stringifyYaml } from "obsidian";
import { isValidKeySequence, parseKeysField } from "./keys";
import { DEFAULT_SHORTCUTS } from "./defaults";
import { normalizeCommand } from "./inputValidation";
import type { Shortcut } from "./types";

export interface LoadShortcutsResult {
  shortcuts: Shortcut[];
  mergedCount: number;
}

export function shortcutSequenceKey(shortcut: Shortcut): string {
  return parseKeysField(shortcut.keys).join(" ");
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

export function validateShortcut(raw: unknown): Shortcut | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.keys !== "string" || typeof entry.command !== "string") return null;
  if (!isValidKeySequence(entry.keys)) return null;
  const command = normalizeCommand(entry.command);
  if (!command.trim()) return null;

  return {
    keys: entry.keys.trim(),
    command,
    name: typeof entry.name === "string" ? entry.name : undefined,
    group: typeof entry.group === "string" ? entry.group : undefined,
  };
}

export function parseShortcutsYaml(yaml: string): Shortcut[] {
  if (!yaml.trim()) return [];
  const data: unknown = parseYaml(yaml);
  if (!Array.isArray(data)) throw new Error("shortcuts.yaml must contain a YAML array.");

  const seen = new Set<string>();
  return data.map((entry, index) => {
    const shortcut = validateShortcut(entry);
    if (!shortcut) {
      throw new Error(`shortcuts.yaml entry ${index + 1} is invalid.`);
    }
    const sequence = shortcutSequenceKey(shortcut);
    if (seen.has(sequence)) {
      throw new Error(`shortcuts.yaml entry ${index + 1} duplicates key sequence "${sequence}".`);
    }
    seen.add(sequence);
    return shortcut;
  });
}

export function stringifyShortcutsYaml(shortcuts: Shortcut[]): string {
  return stringifyYaml(shortcuts);
}

export async function loadShortcuts(
  read: () => Promise<string | null>,
  write: (content: string) => Promise<void>,
): Promise<LoadShortcutsResult> {
  const yaml = await read();
  if (yaml !== null) {
    const shortcuts = parseShortcutsYaml(yaml);
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
