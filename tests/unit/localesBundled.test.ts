import { describe, expect, it } from "vitest";
import { BUNDLED_LOCALE_CODES } from "../../src/l10n/bundled";
import { loadBundledLocale } from "../../src/l10n/bundledLocale";
import { BUNDLED_LOCALE_GZIP_BASE64 } from "../../src/l10n/locales";

describe("bundled locales", () => {
  it("ships every supported locale in the main bundle", () => {
    expect(new Set(BUNDLED_LOCALE_CODES).size).toBe(71);
    expect(Object.keys(BUNDLED_LOCALE_GZIP_BASE64).sort()).toEqual(
      [...BUNDLED_LOCALE_CODES].sort(),
    );
  });

  it("restores complete template quick-access text in every locale", async () => {
    for (const code of ["en", ...BUNDLED_LOCALE_CODES]) {
      const locale = await loadBundledLocale(code);
      expect(locale).not.toBeNull();
      if (!locale) continue;
      expect(locale.insertTemplateNamed).toContain("%1");
      expect(locale.favoriteTemplate).not.toBe("");
      expect(locale.unfavoriteTemplate).not.toBe("");
      expect(locale.favoriteTemplates).not.toBe("");
      expect(locale.recentTemplates).not.toBe("");
    }
  });
});
