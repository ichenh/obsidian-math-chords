const fs = require("fs");

const main = fs.readFileSync("main.js", "utf8");
const catalog = fs.readFileSync("scripts/locale-catalog.json", "utf8");

console.log("main.js:", (main.length / 1024).toFixed(1), "KB");
console.log("locale-catalog.json:", (catalog.length / 1024).toFixed(1), "KB");

const samples = [
  "Enable plugin",
  "启用插件",
  "Aktiveer inprop",
  "プラグインを有効化",
];
for (const s of samples) {
  const count = main.split(s).length - 1;
  console.log(`"${s}" occurrences in main.js:`, count);
}
