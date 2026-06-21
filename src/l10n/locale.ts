import { en, type TranslationKey } from "./locales/en";
import { getActiveLocaleBundle, initLocale } from "./loader";

export { initLocale } from "./loader";

export function t(key: TranslationKey, ...inserts: string[]): string {
  let text = getActiveLocaleBundle()[key] ?? en[key] ?? key;

  for (let i = 0; i < inserts.length; i++) {
    text = text.replace(`%${i + 1}`, inserts[i]);
  }

  return text;
}

export { type TranslationKey } from "./locales/en";
