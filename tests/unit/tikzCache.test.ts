import { describe, expect, it } from "vitest";
import { TikzRenderCache } from "../../src/tikz/cache";
import type { TikzRenderArtifact } from "../../src/tikz/types";

function artifact(size: number): TikzRenderArtifact {
  return {
    bytes: new Uint8Array(size),
    mediaType: "application/pdf",
    backend: "wasm",
    durationMs: 1,
  };
}

describe("TikZ render cache", () => {
  it("evicts the least recently used entry by count", () => {
    const cache = new TikzRenderCache(2, 100);
    cache.set("a", artifact(10));
    cache.set("b", artifact(10));
    expect(cache.get("a")).toBeDefined();
    cache.set("c", artifact(10));
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("does not retain an artifact larger than the byte budget", () => {
    const cache = new TikzRenderCache(4, 5);
    cache.set("large", artifact(6));
    expect(cache.get("large")).toBeUndefined();
  });
});
