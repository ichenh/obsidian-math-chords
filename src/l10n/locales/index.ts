import { en } from "./en";
import type { TranslationKey } from "./en";
import { locale as locale_de } from "./de";
import { locale as locale_es } from "./es";
import { locale as locale_fr } from "./fr";
import { locale as locale_it } from "./it";
import { locale as locale_ja } from "./ja";
import { locale as locale_ko } from "./ko";
import { locale as locale_pt_BR } from "./pt-BR";
import { locale as locale_ru } from "./ru";
import { locale as locale_zh } from "./zh";
import { locale as locale_zh_TW } from "./zh-TW";

export const bundledLocales: Record<string, Record<TranslationKey, string>> = {
  en,
  "de": locale_de,
  "es": locale_es,
  "fr": locale_fr,
  "it": locale_it,
  "ja": locale_ja,
  "ko": locale_ko,
  "pt-BR": locale_pt_BR,
  "ru": locale_ru,
  "zh": locale_zh,
  "zh-TW": locale_zh_TW,
};
