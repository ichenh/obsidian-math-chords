import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TikzRenderCoordinator } from "../../src/tikz/coordinator";
import type {
  TikzRenderArtifact,
  TikzRenderBackend,
  TikzRenderState,
} from "../../src/tikz/types";
import type { TikzPersistentCache } from "../../src/tikz/persistentCache";

describe("TikZ render coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("debounces each consumer and renders only its latest source", async () => {
    const rendered: string[] = [];
    const backend: TikzRenderBackend = {
      id: "wasm",
      isAvailable: async () => true,
      render: async (source) => {
        rendered.push(source);
        return artifact();
      },
      dispose: () => undefined,
    };
    const coordinator = new TikzRenderCoordinator({
      debounceMs: () => 120,
      selectBackend: async () => backend,
    });
    const firstStates: TikzRenderState[] = [];
    const latestStates: TikzRenderState[] = [];

    coordinator.request(
      "editor-1",
      { source: "first", backend: "wasm", theme: "light" },
      (state) => firstStates.push(state),
    );
    coordinator.request(
      "editor-1",
      { source: "latest", backend: "wasm", theme: "light" },
      (state) => latestStates.push(state),
    );
    await vi.runAllTimersAsync();

    expect(rendered).toEqual(["latest"]);
    expect(firstStates.map((state) => state.phase)).toEqual(["scheduled"]);
    expect(latestStates.map((state) => state.phase)).toEqual([
      "scheduled",
      "rendering",
      "ready",
    ]);
    coordinator.dispose();
  });

  it("can bypass the edit debounce for an initial preview", async () => {
    const render = vi.fn(async () => artifact());
    const backend: TikzRenderBackend = {
      id: "wasm",
      isAvailable: async () => true,
      render,
      dispose: () => undefined,
    };
    const coordinator = new TikzRenderCoordinator({
      debounceMs: () => 500,
      selectBackend: async () => backend,
    });

    coordinator.request(
      "editor-1",
      { source: "initial", backend: "wasm", theme: "light" },
      () => undefined,
      0,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(render).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it("aborts an active stale render before compiling the latest source", async () => {
    const rendered: string[] = [];
    const aborted: string[] = [];
    const backend: TikzRenderBackend = {
      id: "wasm",
      isAvailable: async () => true,
      render: (source, signal) => {
        rendered.push(source);
        if (source === "latest") return Promise.resolve(artifact());
        return new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              aborted.push(source);
              reject(new DOMException("cancelled", "AbortError"));
            },
            { once: true },
          );
        });
      },
      dispose: () => undefined,
    };
    const coordinator = new TikzRenderCoordinator({
      debounceMs: () => 120,
      selectBackend: async () => backend,
    });
    const staleStates: TikzRenderState[] = [];
    const latestStates: TikzRenderState[] = [];

    coordinator.request(
      "editor-1",
      { source: "stale", backend: "wasm", theme: "light" },
      (state) => staleStates.push(state),
    );
    await vi.advanceTimersByTimeAsync(120);
    coordinator.request(
      "editor-1",
      { source: "latest", backend: "wasm", theme: "light" },
      (state) => latestStates.push(state),
    );
    await vi.runAllTimersAsync();

    expect(rendered).toEqual(["stale", "latest"]);
    expect(aborted).toEqual(["stale"]);
    expect(staleStates.map((state) => state.phase)).toEqual([
      "scheduled",
      "rendering",
    ]);
    expect(latestStates.map((state) => state.phase)).toEqual([
      "scheduled",
      "rendering",
      "ready",
    ]);
    coordinator.dispose();
  });

  it("restores persistent artifacts without invoking the backend", async () => {
    const persistentArtifact = artifact();
    const clearPersistentCache = vi.fn(async () => undefined);
    const closePersistentCache = vi.fn();
    const persistentCache: TikzPersistentCache = {
      get: vi.fn(async () => persistentArtifact),
      set: vi.fn(async () => undefined),
      clear: clearPersistentCache,
      close: closePersistentCache,
    };
    const render = vi.fn(async () => artifact());
    const backend: TikzRenderBackend = {
      id: "wasm",
      isAvailable: async () => true,
      render,
      dispose: () => undefined,
    };
    const coordinator = new TikzRenderCoordinator({
      debounceMs: () => 0,
      selectBackend: async () => backend,
      persistentCache,
    });
    const states: TikzRenderState[] = [];

    coordinator.request(
      "markdown-1",
      { source: "cached", backend: "wasm", theme: "light" },
      (state) => states.push(state),
    );
    await vi.runAllTimersAsync();

    expect(render).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      phase: "ready",
      artifact: persistentArtifact,
      cached: true,
    });
    expect(coordinator.getDiagnostics()).toMatchObject({
      activeRenders: 0,
      queuedRenders: 0,
      memoryCacheEntries: 1,
      memoryCacheBytes: 1,
      lastRender: {
        phase: "ready",
        backend: "wasm",
        cached: true,
      },
    });
    coordinator.restart();
    expect(coordinator.getDiagnostics().lastRender).toBeNull();
    await coordinator.clearCache();
    expect(clearPersistentCache).toHaveBeenCalledOnce();
    coordinator.dispose();
    expect(closePersistentCache).toHaveBeenCalledOnce();
  });
});

function artifact(): TikzRenderArtifact {
  return {
    bytes: new Uint8Array([1]),
    mediaType: "application/pdf",
    backend: "wasm",
    durationMs: 1,
  };
}
