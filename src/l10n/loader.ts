import { moment, type Plugin } from "obsidian";
import { BUNDLED_LOCALE_CODES } from "./bundled";
import { loadBundledLocale } from "./bundledLocale";
import { en, type TranslationKey } from "./locales/en";
import { resolveLanguage } from "./resolveLanguage";

let activeBundle: Record<TranslationKey, string> = en;

export function getActiveLocaleBundle(): Record<TranslationKey, string> {
  return activeBundle;
}

function isBundled(code: string): boolean {
  return code === "en" || (BUNDLED_LOCALE_CODES as readonly string[]).includes(code);
}

export async function initLocale(plugin: Plugin): Promise<void> {
  // Obsidian can reload a plugin module without restarting the application.
  // Reset cached state so a changed application language or updated locale file
  // is reflected after a reload instead of retaining the previous instance.
  void plugin;
  activeBundle = en;
  const code = resolveLanguage(moment.locale(), supportedLocaleCodes());
  if (isBundled(code)) {
    activeBundle = (await loadBundledLocale(code)) ?? en;
  }
}

export function supportedLocaleCodes(): Set<string> {
  return new Set(["en", ...BUNDLED_LOCALE_CODES]);
}
