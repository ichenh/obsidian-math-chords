import { describe, expect, it } from "vitest";
import {
  detectTikzTextProfile,
  EMPTY_TIKZ_FONT_PREFERENCES,
  tikzCssFontFamily,
  tikzFontPreferencesFromSettings,
} from "../../src/tikz/fonts";

describe("TikZ font selection", () => {
  it("detects Japanese and Korean scripts before shared Han characters", () => {
    expect(detectTikzTextProfile("質量を示す")).toBe("jp");
    expect(detectTikzTextProfile("질량을 표시")).toBe("kr");
  });

  it("uses locale and character hints to distinguish Chinese variants", () => {
    expect(detectTikzTextProfile("质量", "zh-CN")).toBe("sc");
    expect(detectTikzTextProfile("質量", "zh-TW")).toBe("tc");
  });

  it("uses script-specific browser font fallbacks", () => {
    expect(tikzCssFontFamily("日本語", EMPTY_TIKZ_FONT_PREFERENCES, "ja"))
      .toContain('"Source Han Serif JP", "Noto Serif CJK JP", "Yu Mincho"');
    expect(tikzCssFontFamily("한국어", EMPTY_TIKZ_FONT_PREFERENCES, "ko"))
      .toContain('"Source Han Serif K", "Noto Serif CJK KR", "Batang"');
  });

  it("uses Obsidian's loaded TeX font for default Latin TikZ text", () => {
    expect(tikzCssFontFamily(
      "electromagnetic field",
      EMPTY_TIKZ_FONT_PREFERENCES,
      "en",
    )).toContain('"MJXTEX", "Latin Modern Roman"');
  });

  it("applies saved font overrides only when customization is enabled", () => {
    const source = {
      tikzCustomFontsEnabled: false,
      tikzLatinFont: "STIX Two Text",
      tikzSimplifiedChineseFont: "",
      tikzTraditionalChineseFont: "",
      tikzJapaneseFont: "",
      tikzKoreanFont: "",
    };
    expect(tikzFontPreferencesFromSettings(source)).toEqual(
      EMPTY_TIKZ_FONT_PREFERENCES,
    );
    expect(tikzFontPreferencesFromSettings({
      ...source,
      tikzCustomFontsEnabled: true,
    }).latin).toBe("STIX Two Text");
  });
});
