const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const BUNDLE_PATH = path.join(__dirname, ".defaults.cjs");
const OUTPUT_PATH = path.join(ROOT, "shortcuts.yaml");

try {
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src/defaults.ts")],
    bundle: true,
    format: "cjs",
    logLevel: "silent",
    outfile: BUNDLE_PATH,
    platform: "node",
  });
  const { DEFAULT_SHORTCUTS } = require(BUNDLE_PATH);
  const expected = toYaml(DEFAULT_SHORTCUTS);
  if (process.argv.includes("--check")) {
    const actual = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, "utf8") : null;
    if (actual !== expected) {
      console.error("Shortcut check: shortcuts.yaml is stale; run npm run seed.");
      process.exitCode = 1;
    } else {
      console.log(`shortcuts.yaml is current (${DEFAULT_SHORTCUTS.length} shortcuts).`);
    }
  } else {
    fs.writeFileSync(OUTPUT_PATH, expected, "utf8");
    console.log(`Wrote ${DEFAULT_SHORTCUTS.length} shortcuts to shortcuts.yaml.`);
  }
} finally {
  fs.rmSync(BUNDLE_PATH, { force: true });
}

function toYaml(shortcuts) {
  return `${shortcuts
    .map((shortcut) => {
      const fields = [
        `- keys: ${JSON.stringify(shortcut.keys)}`,
        `  command: ${JSON.stringify(shortcut.command)}`,
      ];
      if (shortcut.name) fields.push(`  name: ${JSON.stringify(shortcut.name)}`);
      if (shortcut.group) fields.push(`  group: ${JSON.stringify(shortcut.group)}`);
      return fields.join("\n");
    })
    .join("\n\n")}\n`;
}
