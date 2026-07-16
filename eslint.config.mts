import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules/",
    "dist/",
    "coverage/",
    "main.js",
    "locales-extras.json",
    "shortcuts.yaml",
    "src/l10n/bundled.ts",
    "src/l10n/lazy-codes.ts",
    "src/l10n/locales/index.ts",
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mts",
            "esbuild.config.mjs",
            "vitest.config.ts",
            "scripts/*.cjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["*.config.{mts,ts,mjs}", "scripts/**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Build and validation scripts run only in Node.js; Obsidian mobile
      // runtime restrictions and plugin console guidance do not apply here.
      "@typescript-eslint/no-require-imports": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  {
    rules: {
      // The declarative settings API starts in Obsidian 1.13. Math Chords keeps
      // PluginSettingTab.display() while its declared minimum remains 1.5.0.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
);
