import { TikzRenderCache } from "./cache";
import { hashTikzRenderInput } from "./hash";
import type { TikzPersistentCache } from "./persistentCache";
import {
  CHORD_TIKZ_ENGINE_VERSION,
  CHORD_TIKZ_WASM_SHA256,
} from "./wasm/generatedChordTikzAssets";
import type {
  TikzRenderBackend,
  TikzRenderRequest,
  TikzRenderState,
  TikzRenderSubscription,
} from "./types";

interface PendingRequest {
  generation: number;
  request: TikzRenderRequest;
  listener: (state: TikzRenderState) => void;
  cancelled: boolean;
}

export interface TikzRenderCoordinatorOptions {
  debounceMs: () => number;
  selectBackend: (request: TikzRenderRequest) => Promise<TikzRenderBackend>;
  persistentCache?: TikzPersistentCache;
}

export interface TikzCoordinatorDiagnostics {
  activeRenders: number;
  queuedRenders: number;
  memoryCacheEntries: number;
  memoryCacheBytes: number;
  lastRender:
    | {
        phase: "ready";
        backend: string;
        durationMs: number;
        cached: boolean;
      }
    | {
        phase: "error";
        message: string;
      }
    | null;
}

const TIKZ_RENDER_CACHE_VERSION = [
  "render-v2",
  CHORD_TIKZ_ENGINE_VERSION,
  CHORD_TIKZ_WASM_SHA256,
].join(":");

export class TikzRenderCoordinator {
  private readonly cache = new TikzRenderCache();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly timers = new Map<string, number>();
  private readonly queuedKeys: string[] = [];
  private readonly activeControllers = new Map<string, AbortController>();
  private generation = 0;
  private rendering = false;
  private disposed = false;
  private lastRender: TikzCoordinatorDiagnostics["lastRender"] = null;

  constructor(private readonly options: TikzRenderCoordinatorOptions) {}

  request(
    consumerKey: string,
    request: TikzRenderRequest,
    listener: (state: TikzRenderState) => void,
    delayMs?: number,
  ): TikzRenderSubscription {
    this.activeControllers.get(consumerKey)?.abort();
    const pending: PendingRequest = {
      generation: ++this.generation,
      request,
      listener,
      cancelled: false,
    };
    this.pending.set(consumerKey, pending);
    listener({ phase: "scheduled" });

    const oldTimer = this.timers.get(consumerKey);
    if (oldTimer !== undefined) window.clearTimeout(oldTimer);
    const delay = Math.max(0, delayMs ?? this.options.debounceMs());
    if (delay === 0) {
      this.enqueueLatest(consumerKey);
      return {
        cancel: () => this.cancelRequest(consumerKey, pending),
      };
    }
    const timer = window.setTimeout(() => {
      this.timers.delete(consumerKey);
      this.enqueueLatest(consumerKey);
    }, delay);
    this.timers.set(consumerKey, timer);

    return {
      cancel: () => this.cancelRequest(consumerKey, pending),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAll();
    this.cache.clear();
    this.options.persistentCache?.close();
  }

  restart(): void {
    this.cancelAll();
    this.lastRender = null;
  }

  getDiagnostics(): TikzCoordinatorDiagnostics {
    const cache = this.cache.getStats();
    return {
      activeRenders: this.activeControllers.size,
      queuedRenders: this.queuedKeys.length,
      memoryCacheEntries: cache.entries,
      memoryCacheBytes: cache.bytes,
      lastRender: this.lastRender,
    };
  }

  private cancelAll(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.pending.clear();
    for (const controller of this.activeControllers.values()) controller.abort();
    this.activeControllers.clear();
    this.queuedKeys.length = 0;
  }

  private cancelRequest(
    consumerKey: string,
    pending: PendingRequest,
  ): void {
    this.activeControllers.get(consumerKey)?.abort();
    pending.cancelled = true;
    if (this.pending.get(consumerKey) === pending) {
      this.pending.delete(consumerKey);
    }
    const currentTimer = this.timers.get(consumerKey);
    if (currentTimer !== undefined) {
      window.clearTimeout(currentTimer);
      this.timers.delete(consumerKey);
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    await this.options.persistentCache?.clear();
  }

  private enqueueLatest(consumerKey: string): void {
    if (this.disposed || !this.pending.has(consumerKey)) return;
    if (!this.queuedKeys.includes(consumerKey)) this.queuedKeys.push(consumerKey);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.rendering || this.disposed) return;
    this.rendering = true;
    try {
      while (!this.disposed && this.queuedKeys.length > 0) {
        const consumerKey = this.queuedKeys.shift();
        if (!consumerKey) continue;
        const pending = this.pending.get(consumerKey);
        if (!pending || pending.cancelled) continue;
        await this.renderOne(consumerKey, pending);
      }
    } finally {
      this.rendering = false;
    }
  }

  private async renderOne(
    consumerKey: string,
    pending: PendingRequest,
  ): Promise<void> {
    let backend: TikzRenderBackend;
    try {
      backend = await this.options.selectBackend(pending.request);
    } catch (error) {
      this.publishIfCurrent(consumerKey, pending, {
        phase: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.finishRequest(consumerKey, pending);
      return;
    }
    const cacheKey = hashTikzRenderInput(
      `${TIKZ_RENDER_CACHE_VERSION}\0${backend.id}\0${pending.request.theme}\0${pending.request.fontSignature ?? ""}\0${pending.request.source}`,
    );
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.lastRender = {
        phase: "ready",
        backend: cached.backend,
        durationMs: cached.durationMs,
        cached: true,
      };
      this.publishIfCurrent(consumerKey, pending, {
        phase: "ready",
        artifact: cached,
        cached: true,
      });
      this.finishRequest(consumerKey, pending);
      return;
    }
    const persisted = await this.options.persistentCache?.get(cacheKey);
    if (persisted) {
      this.cache.set(cacheKey, persisted);
      this.lastRender = {
        phase: "ready",
        backend: persisted.backend,
        durationMs: persisted.durationMs,
        cached: true,
      };
      this.publishIfCurrent(consumerKey, pending, {
        phase: "ready",
        artifact: persisted,
        cached: true,
      });
      this.finishRequest(consumerKey, pending);
      return;
    }

    this.publishIfCurrent(consumerKey, pending, { phase: "rendering" });
    const controller = new AbortController();
    this.activeControllers.set(consumerKey, controller);
    try {
      const artifact = await backend.render(
        pending.request.source,
        controller.signal,
      );
      const artifactCacheKey =
        artifact.backend === backend.id
          ? cacheKey
          : hashTikzRenderInput(
              `${TIKZ_RENDER_CACHE_VERSION}\0${artifact.backend}\0${pending.request.theme}\0${pending.request.fontSignature ?? ""}\0${pending.request.source}`,
            );
      this.cache.set(artifactCacheKey, artifact);
      void this.options.persistentCache?.set(artifactCacheKey, artifact);
      this.lastRender = {
        phase: "ready",
        backend: artifact.backend,
        durationMs: artifact.durationMs,
        cached: false,
      };
      this.publishIfCurrent(consumerKey, pending, {
        phase: "ready",
        artifact,
        cached: false,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        this.lastRender = {
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        };
        this.publishIfCurrent(consumerKey, pending, {
          phase: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    } finally {
      if (this.activeControllers.get(consumerKey) === controller) {
        this.activeControllers.delete(consumerKey);
      }
    }

    this.finishRequest(consumerKey, pending);
  }

  private publishIfCurrent(
    consumerKey: string,
    pending: PendingRequest,
    state: TikzRenderState,
  ): void {
    if (
      pending.cancelled ||
      this.disposed ||
      this.pending.get(consumerKey) !== pending
    ) {
      return;
    }
    pending.listener(state);
  }

  private finishRequest(
    consumerKey: string,
    completed: PendingRequest,
  ): void {
    const latest = this.pending.get(consumerKey);
    if (latest === completed) {
      this.pending.delete(consumerKey);
      return;
    }
    if (latest && latest.generation !== completed.generation) {
      this.enqueueLatest(consumerKey);
    }
  }
}
