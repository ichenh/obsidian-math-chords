export type TikzTextProfile = "latin" | "sc" | "tc" | "jp" | "kr";

export interface TikzFontPreferences {
  latin: string;
  simplifiedChinese: string;
  traditionalChinese: string;
  japanese: string;
  korean: string;
}

export interface TikzFontSettingsSource {
  tikzCustomFontsEnabled: boolean;
  tikzLatinFont: string;
  tikzSimplifiedChineseFont: string;
  tikzTraditionalChineseFont: string;
  tikzJapaneseFont: string;
  tikzKoreanFont: string;
}

export const EMPTY_TIKZ_FONT_PREFERENCES: TikzFontPreferences = {
  latin: "",
  simplifiedChinese: "",
  traditionalChinese: "",
  japanese: "",
  korean: "",
};

const DEFAULT_FONT_CANDIDATES: Record<TikzTextProfile, readonly string[]> = {
  latin: [
    "MJXTEX",
    "Latin Modern Roman",
    "CMU Serif",
    "STIX Two Text",
    "Times New Roman",
  ],
  sc: [
    "Noto Serif CJK SC",
    "Source Han Serif SC",
    "SimSun",
    "Songti SC",
  ],
  tc: [
    "Noto Serif CJK TC",
    "Source Han Serif TC",
    "PMingLiU",
    "Songti TC",
  ],
  jp: [
    "Source Han Serif JP",
    "Noto Serif CJK JP",
    "Yu Mincho",
    "Hiragino Mincho ProN",
  ],
  kr: [
    "Source Han Serif K",
    "Noto Serif CJK KR",
    "Batang",
    "AppleMyungjo",
  ],
};

const TRADITIONAL_HINT_RE =
  /[體國學術圖線場現觀點與為這個們來時說會發對業經實開關係義萬區門書長東車馬風龍]/u;

export function normalizeTikzFontName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const normalized = raw.trim().replace(/\s+/g, " ");
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (
    normalized.length > 100 ||
    hasControlCharacter ||
    /[\\{}%#&$^~]/u.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

export function detectTikzTextProfile(
  source: string,
  locale = "",
): TikzTextProfile {
  if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(source)) return "kr";
  if (/[\u3040-\u30ff\u31f0-\u31ff]/u.test(source)) return "jp";
  if (/[\u3100-\u312f\u31a0-\u31bf]/u.test(source)) return "tc";
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(source)) {
    const normalizedLocale = locale.toLowerCase().replace("_", "-");
    if (normalizedLocale === "ja" || normalizedLocale.startsWith("ja-")) {
      return "jp";
    }
    if (normalizedLocale === "ko" || normalizedLocale.startsWith("ko-")) {
      return "kr";
    }
    if (
      normalizedLocale === "zh-tw" ||
      normalizedLocale === "zh-hk" ||
      normalizedLocale === "zh-hant" ||
      TRADITIONAL_HINT_RE.test(source)
    ) {
      return "tc";
    }
    return "sc";
  }
  return "latin";
}

export function tikzFontCandidates(
  profile: TikzTextProfile,
  preferences: TikzFontPreferences,
): string[] {
  const custom = normalizeTikzFontName(customFontForProfile(profile, preferences));
  return [...new Set([
    ...(custom ? [custom] : []),
    ...DEFAULT_FONT_CANDIDATES[profile],
  ])];
}

export function tikzCssFontFamily(
  source: string,
  preferences: TikzFontPreferences,
  locale = "",
): string {
  const profile = detectTikzTextProfile(source, locale);
  return [
    ...tikzFontCandidates(profile, preferences).map(quoteCssFont),
    profile === "latin" ? "serif" : "serif",
  ].join(", ");
}

export function tikzFontSignature(preferences: TikzFontPreferences): string {
  return [
    preferences.latin,
    preferences.simplifiedChinese,
    preferences.traditionalChinese,
    preferences.japanese,
    preferences.korean,
  ].map(normalizeTikzFontName).join("\0");
}

export function tikzFontPreferencesFromSettings(
  settings: TikzFontSettingsSource,
): TikzFontPreferences {
  if (!settings.tikzCustomFontsEnabled) {
    return EMPTY_TIKZ_FONT_PREFERENCES;
  }
  return {
    latin: normalizeTikzFontName(settings.tikzLatinFont),
    simplifiedChinese: normalizeTikzFontName(
      settings.tikzSimplifiedChineseFont,
    ),
    traditionalChinese: normalizeTikzFontName(
      settings.tikzTraditionalChineseFont,
    ),
    japanese: normalizeTikzFontName(settings.tikzJapaneseFont),
    korean: normalizeTikzFontName(settings.tikzKoreanFont),
  };
}

function customFontForProfile(
  profile: TikzTextProfile,
  preferences: TikzFontPreferences,
): string {
  if (profile === "sc") return preferences.simplifiedChinese;
  if (profile === "tc") return preferences.traditionalChinese;
  if (profile === "jp") return preferences.japanese;
  if (profile === "kr") return preferences.korean;
  return preferences.latin;
}

function quoteCssFont(font: string): string {
  return `"${font.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
