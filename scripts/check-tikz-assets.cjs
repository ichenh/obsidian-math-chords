"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { tikzSourceFingerprint } = require("./tikz-source-fingerprint.cjs");

const generatedPath = path.resolve(
  __dirname,
  "..",
  "src",
  "tikz",
  "wasm",
  "generatedChordTikzAssets.ts",
);
const generated = fs.readFileSync(generatedPath, "utf8");
const match = generated.match(
  /export const CHORD_TIKZ_SOURCE_SHA256 = "([a-f0-9]{64})";/,
);
if (!match) {
  throw new Error(
    "The generated TikZ assets do not contain a source fingerprint. Rebuild them.",
  );
}
const current = tikzSourceFingerprint();
if (match[1] !== current) {
  throw new Error(
    `The embedded TikZ assets are stale (${match[1]} != ${current}). Run npm run build:tikz-wasm.`,
  );
}
process.stdout.write(`Embedded TikZ source fingerprint is current (${current}).\n`);
