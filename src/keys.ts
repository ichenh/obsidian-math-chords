const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);
const MOD_ORDER = ["ctrl", "alt", "shift", "meta"] as const;

function modIndex(mod: string): number {
  const index = MOD_ORDER.indexOf(mod as (typeof MOD_ORDER)[number]);
  return index === -1 ? MOD_ORDER.length : index;
}

function normalizeModifier(part: string): string | null {
  switch (part.toLowerCase()) {
    case "ctrl":
    case "control":
      return "ctrl";
    case "alt":
    case "option":
      return "alt";
    case "shift":
      return "shift";
    case "meta":
    case "cmd":
    case "command":
    case "win":
      return "meta";
    default:
      return null;
  }
}

export function normalizeKeyName(key: string): string {
  const lower = key.toLowerCase();
  if (lower === " ") return "space";
  if (lower === "escape") return "escape";
  if (lower === "enter") return "enter";
  if (lower === "backspace") return "backspace";
  if (lower.length === 1) return lower;
  return lower;
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key.toLowerCase());
}

function sortMods(mods: string[]): string[] {
  return [...mods].sort((a, b) => modIndex(a) - modIndex(b));
}

export function parseChord(chord: string): string {
  const parts = chord
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const mods: string[] = [];
  let base = "";

  for (const part of parts) {
    const mod = normalizeModifier(part);
    if (mod) {
      if (!mods.includes(mod)) mods.push(mod);
      continue;
    }
    base = normalizeKeyName(part);
  }

  const ordered = sortMods(mods);
  if (!base) return ordered.join("+");
  return [...ordered, base].join("+");
}

export function parseKeysField(keys: string): string[] {
  const trimmed = keys.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).map(parseChord).filter((token) => token.length > 0);
}

export function parseLeaderKey(leader: string): string {
  return parseChord(leader.trim());
}

export function normalizeEvent(event: KeyboardEvent): string {
  const mods: string[] = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  if (event.metaKey) mods.push("meta");

  const key = normalizeKeyName(event.key);
  if (!isModifierKey(key)) {
    return sortMods(mods).concat(key).join("+");
  }
  return sortMods(mods).join("+");
}

export function eventMatchesLeader(event: KeyboardEvent, leaderKey: string): boolean {
  return normalizeEvent(event) === parseLeaderKey(leaderKey);
}

export function eventMatchesChord(event: KeyboardEvent, chord: string): boolean {
  const trimmed = chord.trim();
  if (!trimmed) return false;
  return normalizeEvent(event) === parseChord(trimmed);
}

export function normalizeSequenceKey(event: KeyboardEvent): string | null {
  const key = normalizeKeyName(event.key);
  if (isModifierKey(key)) return null;

  if (event.ctrlKey || event.altKey || event.metaKey) return null;

  if (event.shiftKey) return `shift+${key}`;
  return key;
}

export function formatToken(token: string): string {
  return token
    .split("+")
    .map((part) => {
      if (part.length === 1 && /[a-z0-9]/i.test(part)) return part.toUpperCase();
      if (part === "shift") return "Shift";
      if (part === "ctrl") return "Ctrl";
      if (part === "alt") return "Alt";
      if (part === "meta") return "Meta";
      return part;
    })
    .join("+");
}

export function formatSequence(sequence: string[], leaderKey: string): string {
  if (sequence.length === 0) return formatToken(parseLeaderKey(leaderKey));
  return `${formatToken(parseLeaderKey(leaderKey))} ${sequence.map(formatToken).join(" ")}`;
}
