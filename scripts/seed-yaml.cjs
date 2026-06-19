const { execSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const bundlePath = resolve(__dirname, ".defaults.cjs");

execSync(
  `npx esbuild ${resolve(root, "src/defaults.ts")} --bundle --platform=node --format=cjs --outfile=${bundlePath}`,
  { cwd: root, stdio: "inherit" },
);

const { DEFAULT_SHORTCUTS } = require("./.defaults.cjs");

function toYaml(shortcuts) {
  return (
    shortcuts
      .map((shortcut) => {
        let block = `- keys: ${JSON.stringify(shortcut.keys)}\n  command: ${JSON.stringify(shortcut.command)}`;
        if (shortcut.name) block += `\n  name: ${JSON.stringify(shortcut.name)}`;
        if (shortcut.group) block += `\n  group: ${JSON.stringify(shortcut.group)}`;
        return block;
      })
      .join("\n\n") + "\n"
  );
}

writeFileSync("shortcuts.yaml", toYaml(DEFAULT_SHORTCUTS));
console.log(`Wrote ${DEFAULT_SHORTCUTS.length} shortcuts to shortcuts.yaml`);
