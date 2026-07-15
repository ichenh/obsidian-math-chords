const fs = require("node:fs");
const path = require("node:path");
const {
  BUNDLED_LOCALE_CODES,
  LOCALES_DIR,
  ROOT,
  readInputs,
  renderBundledCodes,
  renderBundledIndex,
  renderExtras,
  renderLazyCodes,
  renderLocaleFile,
  validateCatalog,
} = require("./locale-utils.cjs");

const INDEX_PATH = path.join(LOCALES_DIR, "index.ts");
const BUNDLED_CODES_PATH = path.join(ROOT, "src/l10n/bundled.ts");
const LAZY_CODES_PATH = path.join(ROOT, "src/l10n/lazy-codes.ts");
const EXTRAS_PATH = path.join(ROOT, "locales-extras.json");
const { catalog, catalogCodes, lazyCodes, translationKeys } = readInputs();
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
fs.writeFileSync(INDEX_PATH, renderBundledIndex(), "utf8");
fs.writeFileSync(BUNDLED_CODES_PATH, renderBundledCodes(), "utf8");
fs.writeFileSync(LAZY_CODES_PATH, renderLazyCodes(lazyCodes), "utf8");
fs.writeFileSync(EXTRAS_PATH, renderExtras(catalog, lazyCodes), "utf8");

console.log(
  `Bundled ${BUNDLED_LOCALE_CODES.length} locales (+ en); generated ${lazyCodes.length} lazy locales in ${path.relative(ROOT, EXTRAS_PATH)}.`,
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
