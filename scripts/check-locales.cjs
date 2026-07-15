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

const { catalog, catalogCodes, lazyCodes, translationKeys } = readInputs();
const errors = validateCatalog(catalog, catalogCodes, translationKeys);

checkGenerated(
  "src/l10n/locales/index.ts",
  renderBundledIndex(),
  errors,
);
checkGenerated("src/l10n/bundled.ts", renderBundledCodes(), errors);
checkGenerated("src/l10n/lazy-codes.ts", renderLazyCodes(lazyCodes), errors);
checkGenerated("locales-extras.json", renderExtras(catalog, lazyCodes), errors);
for (const code of BUNDLED_LOCALE_CODES) {
  checkGenerated(
    path.relative(ROOT, path.join(LOCALES_DIR, `${code}.ts`)),
    renderLocaleFile(catalog[code], translationKeys),
    errors,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`Locale check: ${error}`);
  process.exit(1);
}

const mainSize = fs.statSync(path.join(ROOT, "main.js")).size;
const extrasSize = fs.statSync(path.join(ROOT, "locales-extras.json")).size;
console.log(
  `Locales are complete and generated artifacts are current: ${BUNDLED_LOCALE_CODES.length + 1} bundled, ${lazyCodes.length} lazy; main.js ${(mainSize / 1024).toFixed(1)} KB, extras ${(extrasSize / 1024).toFixed(1)} KB.`,
);

function checkGenerated(relativePath, expected, errors) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`${relativePath} is missing; run npm run seed:locales`);
    return;
  }
  if (fs.readFileSync(filePath, "utf8") !== expected) {
    errors.push(`${relativePath} is stale; run npm run seed:locales`);
  }
}
