/** Shipped inside main.js for zero-latency UI. All other Obsidian locales load from locales-extras.json. */
export const BUNDLED_LOCALE_CODES = [
  "zh",
  "zh-TW",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "ru",
  "pt-BR",
  "it",
] as const;

export type BundledLocaleCode = (typeof BUNDLED_LOCALE_CODES)[number];
