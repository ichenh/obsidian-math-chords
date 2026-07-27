import { describe, expect, it } from "vitest";
import {
  CHORD_TIKZ_WASM_GZIP_BASE64,
  CHORD_TIKZ_WASM_SHA256,
} from "../../src/tikz/wasm/generatedChordTikzAssets";

describe("embedded TikZ assets", () => {
  it("restores the original vector WASM without changing its bytes", async () => {
    await expectAsset(
      CHORD_TIKZ_WASM_GZIP_BASE64,
      CHORD_TIKZ_WASM_SHA256,
      true,
    );
  });
});

function expectAsset(
  encoded: string,
  expectedSha256: string,
  compressedForEmbedding: boolean,
): Promise<void> {
  return verify();

  async function verify(): Promise<void> {
    const embedded = decodeBase64(encoded);
    const asset = compressedForEmbedding
      ? await inflateGzip(embedded)
      : embedded;
    expect(asset.byteLength).toBeGreaterThan(0);
    expect(await sha256Hex(asset)).toBe(expectedSha256);
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function inflateGzip(compressed: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
