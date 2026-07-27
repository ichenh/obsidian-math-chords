"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const EXACT_FILES = [
  "scripts/build-chord-tikz-wasm.cjs",
  "scripts/tikz-source-fingerprint.cjs",
  "crates/chord-tikz-core/Cargo.lock",
  "crates/chord-tikz-core/Cargo.toml",
  "src/tikz/wasm/chordTikzWorker.ts",
  "src/tikz/wasm/gzip.ts",
];
const RECURSIVE_DIRECTORIES = ["crates/chord-tikz-core/src"];

function tikzSourceFingerprint() {
  const files = [
    ...EXACT_FILES,
    ...RECURSIVE_DIRECTORIES.flatMap(listFiles),
  ].sort();
  const hash = crypto.createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(ROOT, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listFiles(relativeDirectory) {
  const directory = path.join(ROOT, relativeDirectory);
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? listFiles(relativePath) : [relativePath];
    });
}

module.exports = { tikzSourceFingerprint };
