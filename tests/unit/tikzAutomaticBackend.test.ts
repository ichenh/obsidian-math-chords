import { describe, expect, it, vi } from "vitest";
import {
  AutomaticTikzBackend,
  selectAutomaticTikzBackend,
} from "../../src/tikz/backends/automaticTikzBackend";
import type {
  TikzRenderArtifact,
  TikzRenderBackend,
} from "../../src/tikz/types";

describe("automatic TikZ backend", () => {
  it("selects WASM without consulting local TeX when WASM is available", async () => {
    const wasm = backend("wasm", artifact("wasm"));
    const getNative = vi.fn();
    const getWasm = vi.fn(async () => wasm);

    await expect(selectAutomaticTikzBackend("source", {
      getWasm,
      getNative,
    })).resolves.toBe(wasm);
    expect(getWasm).toHaveBeenCalledOnce();
    expect(getNative).not.toHaveBeenCalled();
  });

  it("selects local TeX before WASM for known compatibility syntax", async () => {
    const native = backend("native", artifact("native"));
    const getWasm = vi.fn(async () => backend("wasm", artifact("wasm")));
    const getNative = vi.fn(async () => native);

    await expect(
      selectAutomaticTikzBackend(
        String.raw`\foreach \x [evaluate=\x as \y using \x^2] in {1,2}{\draw (0,0) circle (\y);}`,
        { getWasm, getNative },
      ),
    ).resolves.toBe(native);
    expect(getNative).toHaveBeenCalledOnce();
    expect(getWasm).not.toHaveBeenCalled();
  });

  it("preflights unsupported styling to local TeX", async () => {
    const native = backend("native", artifact("native"));
    const getWasm = vi.fn(async () => backend("wasm", artifact("wasm")));
    const getNative = vi.fn(async () => native);

    await expect(
      selectAutomaticTikzBackend(
        String.raw`\draw[blur shadow] (0,0) -- (1,1);`,
        { getWasm, getNative },
      ),
    ).resolves.toBe(native);
    expect(getNative).toHaveBeenCalledOnce();
    expect(getWasm).not.toHaveBeenCalled();
  });

  it("keeps bounded foreach loops on the WASM fast path", async () => {
    const wasm = backend("wasm", artifact("wasm"));
    const getWasm = vi.fn(async () => wasm);
    const getNative = vi.fn();

    await expect(
      selectAutomaticTikzBackend(
        String.raw`\foreach \r in {0.8,1.5,2.3}{\draw (0,0) circle (\r);}`,
        { getWasm, getNative },
      ),
    ).resolves.toBe(wasm);
    expect(getNative).not.toHaveBeenCalled();
  });

  it("uses WASM when compatibility syntax has no local TeX fallback", async () => {
    const wasm = backend("wasm", artifact("wasm"));
    const getWasm = vi.fn(async () => wasm);
    const getNative = vi.fn(async () => null);

    await expect(
      selectAutomaticTikzBackend(String.raw`\def\a{3}\draw (0,0) circle (\a);`, {
        getWasm,
        getNative,
      }),
    ).resolves.toBe(wasm);
  });

  it("selects local TeX when the WASM backend is unavailable", async () => {
    const native = backend("native", artifact("native"));
    const getWasm = vi.fn(async () => null);
    const getNative = vi.fn(async () => native);

    await expect(selectAutomaticTikzBackend("source", {
      getWasm,
      getNative,
    })).resolves.toBe(native);
    expect(getNative).toHaveBeenCalledWith("source");
  });

  it("reports no backend when neither implementation is available", async () => {
    const getWasm = vi.fn(async () => null);
    const getNative = vi.fn(async () => null);

    await expect(selectAutomaticTikzBackend("source", {
      getWasm,
      getNative,
    })).resolves.toBeNull();
  });

  it("falls back to local TeX for WASM infrastructure failures", async () => {
    const wasm = backend(
      "wasm",
      new Error("The built-in WASM worker initialization timed out."),
    );
    const nativeArtifact = artifact("native");
    const native = backend("native", nativeArtifact);
    const getNative = vi.fn(async () => native);
    const automatic = new AutomaticTikzBackend(wasm, getNative);

    await expect(automatic.render("source")).resolves.toBe(nativeArtifact);
    expect(getNative).toHaveBeenCalledOnce();
  });

  it("falls back to local TeX for an unclassified compatibility error", async () => {
    const error = new Error("This fast WASM core does not support the command.");
    const nativeArtifact = artifact("native");
    const getNative = vi.fn(async () => backend("native", nativeArtifact));
    const automatic = new AutomaticTikzBackend(
      backend("wasm", error),
      getNative,
    );

    await expect(automatic.render("source")).resolves.toBe(nativeArtifact);
    expect(getNative).toHaveBeenCalledOnce();
  });

  it("preserves the WASM error when local TeX is unavailable", async () => {
    const error = new Error("A TikZ path needs at least one coordinate.");
    const automatic = new AutomaticTikzBackend(
      backend("wasm", error),
      vi.fn(async () => null),
    );

    await expect(automatic.render("source")).rejects.toBe(error);
  });
});

function backend(
  id: "wasm" | "native",
  result: TikzRenderArtifact | Error,
): TikzRenderBackend {
  return {
    id,
    isAvailable: async () => true,
    render: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    dispose: () => undefined,
  };
}

function artifact(backendId: "wasm" | "native"): TikzRenderArtifact {
  return {
    bytes: new Uint8Array([1]),
    mediaType: "image/svg+xml",
    backend: backendId,
    durationMs: 1,
  };
}
