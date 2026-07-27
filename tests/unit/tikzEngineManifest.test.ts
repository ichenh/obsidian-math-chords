import { describe, expect, it } from "vitest";
import {
  MATH_CHORDS_TIKZ_PROTOCOL_VERSION,
  parseMathChordsTikzManifest,
} from "../../src/tikz/tikzEngineManifest";

const HASH = "a".repeat(64);

describe("Math Chords TikZ engine manifest", () => {
  it("accepts a versioned core and optional CJK profile", () => {
    const manifest = parseMathChordsTikzManifest({
      protocolVersion: MATH_CHORDS_TIKZ_PROTOCOL_VERSION,
      engine: "chord-vector",
      engineVersion: "0.1.0",
      assetVersion: "2026.1",
      assets: [
        { path: "chord-tikz-core.wasm", bytes: 10, sha256: HASH },
        { path: "chord-tikz-worker.js", bytes: 20, sha256: HASH },
        { path: "packs/cjk.pack", bytes: 30, sha256: HASH },
      ],
      profiles: {
        core: ["chord-tikz-core.wasm", "chord-tikz-worker.js"],
        cjk: ["packs/cjk.pack"],
      },
    });
    expect(manifest.profiles.cjk).toEqual(["packs/cjk.pack"]);
  });

  it("rejects traversal paths and unknown profile assets", () => {
    expect(() =>
      parseMathChordsTikzManifest({
        protocolVersion: MATH_CHORDS_TIKZ_PROTOCOL_VERSION,
        engine: "chord-vector",
        engineVersion: "0.1.0",
        assetVersion: "2026.1",
        assets: [{ path: "../engine.wasm", bytes: 10, sha256: HASH }],
        profiles: { core: ["../engine.wasm"] },
      }),
    ).toThrow(/unsafe/i);

    expect(() =>
      parseMathChordsTikzManifest({
        protocolVersion: MATH_CHORDS_TIKZ_PROTOCOL_VERSION,
        engine: "chord-vector",
        engineVersion: "0.1.0",
        assetVersion: "2026.1",
        assets: [{ path: "engine.wasm", bytes: 10, sha256: HASH }],
        profiles: { core: ["missing.pack"] },
      }),
    ).toThrow(/profile/i);
  });
});
