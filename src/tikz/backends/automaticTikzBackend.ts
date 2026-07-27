import type { TikzRenderArtifact, TikzRenderBackend } from "../types";
import { analyzeTikzCapabilities } from "../capabilityAnalyzer";

export interface AutomaticTikzBackendOptions {
  getWasm: () => Promise<TikzRenderBackend | null>;
  getNative: (source: string) => Promise<TikzRenderBackend | null>;
}

export async function selectAutomaticTikzBackend(
  source: string,
  options: AutomaticTikzBackendOptions,
): Promise<TikzRenderBackend | null> {
  if (analyzeTikzCapabilities(source).tier === "compatibility") {
    const native = await options.getNative(source);
    if (native) return native;
  }
  const wasm = await options.getWasm();
  if (wasm) return wasm;
  return options.getNative(source);
}

export function isWasmSourceCompatibilityError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  return !isWasmInfrastructureError(error);
}

export function isWasmInfrastructureError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  return /initializ|worker error|worker did not|assets are missing|disposed|restarted|timed out|safety limit|out of memory|integrity|protocol|invalid UTF-8|webassembly|decompression/i.test(
    error.message,
  );
}

export class AutomaticTikzBackend implements TikzRenderBackend {
  readonly id = "wasm";

  constructor(
    private readonly wasm: TikzRenderBackend,
    private readonly getNative: () => Promise<TikzRenderBackend | null>,
  ) {}

  isAvailable(): Promise<boolean> {
    return this.wasm.isAvailable();
  }

  async render(
    source: string,
    signal?: AbortSignal,
  ): Promise<TikzRenderArtifact> {
    try {
      return await this.wasm.render(source, signal);
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      const native = await this.getNative();
      if (!native) throw error;
      return native.render(source, signal);
    }
  }

  dispose(): void {
    // The registry owns both underlying backends.
  }
}
