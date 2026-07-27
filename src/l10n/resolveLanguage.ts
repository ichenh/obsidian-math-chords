import type { BundledLocaleCode } from "./bundled";

type SupportedLocaleCode = BundledLocaleCode | "en";

const ALIASES: Record<string, SupportedLocaleCode> = {
  "en-gb": "en-GB",
  "pt-br": "pt-BR",
  "zh-tw": "zh-TW",
  "nan-tw": "nan-TW",
};

const PREFIX_FALLBACKS: Record<string, SupportedLocaleCode> = {
  nn: "no",
};

export function resolveLanguage(code: string, available: ReadonlySet<string>): string {
  const trimmed = code.trim();
  if (!trimmed) return "en";

  if (available.has(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  const alias = ALIASES[lower];
  if (alias && available.has(alias)) return alias;

  if (available.has(lower)) return lower;

  const base = lower.split("-")[0];
  const baseFallback = PREFIX_FALLBACKS[base];
  if (baseFallback && available.has(baseFallback)) return baseFallback;

  if (available.has(base)) return base;

  if (base === "zh" && available.has("zh")) return "zh";

  return "en";
}
