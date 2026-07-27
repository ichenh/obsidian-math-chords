const fs = require("node:fs");
const path = require("node:path");
const {
  BUNDLED_LOCALE_CODES,
  LOCALES_DIR,
  ROOT,
  readInputs,
  renderBundledCodes,
  renderBundledIndex,
  renderLocaleFile,
  validateCatalog,
} = require("./locale-utils.cjs");

const INDEX_PATH = path.join(LOCALES_DIR, "index.ts");
const BUNDLED_CODES_PATH = path.join(ROOT, "src/l10n/bundled.ts");
const { catalog, catalogCodes, translationKeys } = readInputs();
const errors = validateCatalog(catalog, catalogCodes, translationKeys);
if (errors.length > 0) throw new Error(errors.join("\n"));

fs.mkdirSync(LOCALES_DIR, { recursive: true });
removeStaleLocaleFiles();

for (const code of BUNDLED_LOCALE_CODES) {
  fs.writeFileSync(
    path.join(LOCALES_DIR, `${code}.ts`),
    renderLocaleFile(catalog[code], translationKeys),
    "utf8",
  );
}
fs.writeFileSync(
  INDEX_PATH,
  renderBundledIndex(catalog, translationKeys),
  "utf8",
);
fs.writeFileSync(BUNDLED_CODES_PATH, renderBundledCodes(), "utf8");

console.log(
  `Bundled all ${BUNDLED_LOCALE_CODES.length} catalog locales (+ en) into main.js.`,
);

function removeStaleLocaleFiles() {
  const keep = new Set([
    "en.ts",
    "index.ts",
    ...BUNDLED_LOCALE_CODES.map((code) => `${code}.ts`),
  ]);
  for (const file of fs.readdirSync(LOCALES_DIR)) {
    if (file.endsWith(".ts") && !keep.has(file)) fs.unlinkSync(path.join(LOCALES_DIR, file));
  }
}
