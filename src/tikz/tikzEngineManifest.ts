export const MATH_CHORDS_TIKZ_PROTOCOL_VERSION = 1;

export interface MathChordsTikzAsset {
  path: string;
  bytes: number;
  sha256: string;
}

export interface MathChordsTikzManifest {
  protocolVersion: typeof MATH_CHORDS_TIKZ_PROTOCOL_VERSION;
  engine: "chord-vector";
  engineVersion: string;
  assetVersion: string;
  assets: MathChordsTikzAsset[];
  profiles: {
    core: string[];
    cjk?: string[];
  };
}

export function parseMathChordsTikzManifest(
  raw: unknown,
): MathChordsTikzManifest {
  if (!isRecord(raw)) {
    throw new Error("Math Chords TikZ manifest must be an object.");
  }
  if (raw.protocolVersion !== MATH_CHORDS_TIKZ_PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported Math Chords TikZ protocol version: ${String(raw.protocolVersion)}.`,
    );
  }
  if (raw.engine !== "chord-vector") {
    throw new Error(
      `Unsupported Math Chords TikZ engine: ${String(raw.engine)}.`,
    );
  }
  if (!isVersion(raw.engineVersion) || !isVersion(raw.assetVersion)) {
    throw new Error("Math Chords TikZ manifest versions are invalid.");
  }
  if (!Array.isArray(raw.assets) || !isRecord(raw.profiles)) {
    throw new Error("Math Chords TikZ manifest assets or profiles are invalid.");
  }

  const assets = raw.assets.map(parseAsset);
  const assetPaths = new Set(assets.map((asset) => asset.path));
  if (assetPaths.size !== assets.length) {
    throw new Error(
      "Math Chords TikZ manifest contains duplicate asset paths.",
    );
  }
  const core = parseProfile(raw.profiles.core, "core", assetPaths);
  const cjk =
    raw.profiles.cjk === undefined
      ? undefined
      : parseProfile(raw.profiles.cjk, "cjk", assetPaths);

  return {
    protocolVersion: MATH_CHORDS_TIKZ_PROTOCOL_VERSION,
    engine: "chord-vector",
    engineVersion: raw.engineVersion,
    assetVersion: raw.assetVersion,
    assets,
    profiles: { core, ...(cjk ? { cjk } : {}) },
  };
}

function parseAsset(raw: unknown): MathChordsTikzAsset {
  if (!isRecord(raw)) {
    throw new Error("Math Chords TikZ asset entry is invalid.");
  }
  if (
    typeof raw.path !== "string" ||
    !/^[a-z0-9][a-z0-9._/-]*$/i.test(raw.path) ||
    raw.path.includes("..") ||
    raw.path.startsWith("/") ||
    raw.path.includes("\\")
  ) {
    throw new Error(
      `Unsafe Math Chords TikZ asset path: ${String(raw.path)}.`,
    );
  }
  if (
    typeof raw.bytes !== "number" ||
    !Number.isSafeInteger(raw.bytes) ||
    raw.bytes <= 0
  ) {
    throw new Error(`Invalid Math Chords TikZ asset size for ${raw.path}.`);
  }
  if (typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(raw.sha256)) {
    throw new Error(`Invalid Math Chords TikZ SHA-256 for ${raw.path}.`);
  }
  return {
    path: raw.path,
    bytes: raw.bytes,
    sha256: raw.sha256.toLowerCase(),
  };
}

function parseProfile(
  raw: unknown,
  name: string,
  assetPaths: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      `Math Chords TikZ ${name} profile references invalid assets.`,
    );
  }
  const paths: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || !assetPaths.has(value)) {
      throw new Error(
        `Math Chords TikZ ${name} profile references invalid assets.`,
      );
    }
    paths.push(value);
  }
  return [...new Set(paths)];
}

function isVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[a-z0-9][a-z0-9._+-]*$/i.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
