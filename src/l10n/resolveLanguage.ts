/** Language codes from https://github.com/obsidianmd/obsidian-translations#existing-languages */
export const OBSIDIAN_LANGUAGE_CODES = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "dv",
  "el",
  "en",
  "en-GB",
  "eo",
  "es",
  "eu",
  "fa",
  "fi",
  "fr",
  "ga",
  "gl",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ka",
  "kh",
  "kn",
  "ko",
  "ky",
  "la",
  "lt",
  "lv",
  "ml",
  "ms",
  "nan-TW",
  "ne",
  "nl",
  "nn",
  "no",
  "oc",
  "or",
  "pl",
  "pt",
  "pt-BR",
  "ro",
  "ru",
  "sa",
  "si",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tl",
  "tr",
  "tt",
  "uk",
  "ur",
  "uz",
  "vi",
  "zh",
  "zh-TW",
] as const;

export type ObsidianLanguageCode = (typeof OBSIDIAN_LANGUAGE_CODES)[number];

const ALIASES: Record<string, ObsidianLanguageCode | "en"> = {
  "en-gb": "en-GB",
  "pt-br": "pt-BR",
  "zh-tw": "zh-TW",
  "nan-tw": "nan-TW",
};

const PREFIX_FALLBACKS: Record<string, ObsidianLanguageCode | "en"> = {
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
