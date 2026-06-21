import { getLanguage, normalizePath, type Plugin } from "obsidian";
import { BUNDLED_LOCALE_CODES } from "./bundled";
import { LAZY_LOCALE_CODES } from "./lazy-codes";
import { en, type TranslationKey } from "./locales/en";
import { bundledLocales } from "./locales/index";
import { resolveLanguage } from "./resolveLanguage";

const EXTRAS_FILE = "locales-extras.json";

let activeBundle: Record<TranslationKey, string> = en;
let extrasByCode: Record<string, Record<TranslationKey, string>> | null = null;
let loadPromise: Promise<void> | null = null;

export function getActiveLocaleBundle(): Record<TranslationKey, string> {
  return activeBundle;
}

function isBundled(code: string): boolean {
  return code === "en" || (BUNDLED_LOCALE_CODES as readonly string[]).includes(code);
}

function bundledBundle(code: string): Record<TranslationKey, string> {
  return bundledLocales[code as keyof typeof bundledLocales] ?? en;
}

function lazyLocaleCodes(): readonly string[] {
  return LAZY_LOCALE_CODES;
}

async function readExtras(plugin: Plugin): Promise<Record<string, Record<TranslationKey, string>>> {
  if (extrasByCode) return extrasByCode;

  const path = normalizePath(`${plugin.manifest.dir}/${EXTRAS_FILE}`);
  const raw = await plugin.app.vault.adapter.read(path);
  extrasByCode = JSON.parse(raw) as Record<string, Record<TranslationKey, string>>;
  return extrasByCode;
}

async function applyLocale(plugin: Plugin, code: string): Promise<void> {
  if (isBundled(code)) {
    activeBundle = bundledBundle(code);
    return;
  }

  try {
    const extras = await readExtras(plugin);
    activeBundle = extras[code] ?? en;
  } catch (error) {
    console.warn(`Math Chords: could not load locale "${code}" from ${EXTRAS_FILE}; falling back to English.`, error);
    activeBundle = en;
  }
}

export function initLocale(plugin: Plugin): Promise<void> {
  if (loadPromise) return loadPromise;

  const code = resolveLanguage(getLanguage(), supportedLocaleCodes());
  loadPromise = applyLocale(plugin, code);
  return loadPromise;
}

export function supportedLocaleCodes(): Set<string> {
  return new Set(["en", ...BUNDLED_LOCALE_CODES, ...lazyLocaleCodes()]);
}
