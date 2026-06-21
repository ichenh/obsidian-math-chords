const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUNDLED = ["en", "zh", "zh-TW", "ja", "ko", "de", "fr", "es", "ru", "pt-BR", "it"];

const main = fs.statSync(path.join(ROOT, "main.js"));
const extras = fs.statSync(path.join(ROOT, "locales-extras.json"));
const catalog = require("./locale-catalog.json");

const enSource = fs.readFileSync(path.join(ROOT, "src/l10n/locales/en.ts"), "utf8");
const keys = [...enSource.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);

console.log("main.js KB:", (main.size / 1024).toFixed(1));
console.log("locales-extras.json KB:", (extras.size / 1024).toFixed(1));
console.log("bundled:", BUNDLED.length, "lazy:", Object.keys(catalog).length - (BUNDLED.length - 1));

for (const code of Object.keys(catalog)) {
  const missing = keys.filter((k) => !(k in catalog[code]));
  if (missing.length > 0) console.log(`${code} missing:`, missing.length);
}

for (const code of BUNDLED.slice(1)) {
  if (!fs.existsSync(path.join(ROOT, `src/l10n/locales/${code}.ts`))) {
    console.error("missing bundled file:", code);
    process.exit(1);
  }
}

const lazy = JSON.parse(fs.readFileSync(path.join(ROOT, "locales-extras.json"), "utf8"));
console.log("extras locales:", Object.keys(lazy).length);
