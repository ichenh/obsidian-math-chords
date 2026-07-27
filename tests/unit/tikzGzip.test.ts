import { describe, expect, it } from "vitest";
import { inflateGzipInto } from "../../src/tikz/wasm/gzip";

describe("TikZ worker gzip streaming", () => {
  it("restores directly into the caller-provided buffer", async () => {
    const source = new TextEncoder().encode("embedded WASM payload");
    const compressed = await gzip(source);
    const destination = new Uint8Array(source.byteLength);

    await inflateGzipInto(compressed, destination);

    expect(destination).toEqual(source);
  });

  it("rejects an output-size mismatch", async () => {
    const compressed = await gzip(new Uint8Array([1, 2, 3, 4]));

    await expect(
      inflateGzipInto(compressed, new Uint8Array(3)),
    ).rejects.toThrow("expected size");
  });
});

async function gzip(source: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([source.buffer])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
