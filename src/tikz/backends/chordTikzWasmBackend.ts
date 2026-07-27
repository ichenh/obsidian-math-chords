import { MATH_CHORDS_TIKZ_PROTOCOL_VERSION } from "../tikzEngineManifest";
import type { TikzRenderArtifact, TikzRenderBackend } from "../types";
import {
  CHORD_TIKZ_ENGINE_VERSION,
  CHORD_TIKZ_WASM_GZIP_BASE64,
  CHORD_TIKZ_WORKER_SOURCE,
} from "../wasm/generatedChordTikzAssets";

interface ChordTikzReadyMessage {
  type: "ready";
  protocolVersion: number;
  engineVersion: string;
}

interface ChordTikzResultMessage {
  type: "result";
  requestId: number;
  svg: ArrayBuffer | Uint8Array;
}

interface ChordTikzErrorMessage {
  type: "error";
  requestId?: number;
  message: string;
}

type ChordTikzWorkerMessage =
  | ChordTikzReadyMessage
  | ChordTikzResultMessage
  | ChordTikzErrorMessage;

interface PendingCompile {
  resolve: (artifact: TikzRenderArtifact) => void;
  reject: (error: Error) => void;
  startedAt: number;
  timeout: number;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

export class ChordTikzWasmBackend implements TikzRenderBackend {
  readonly id = "wasm";
  private worker: Worker | null = null;
  private initialization: Promise<void> | null = null;
  private available = true;
  private requestId = 0;
  private readonly pending = new Map<number, PendingCompile>();

  isAvailable(): Promise<boolean> {
    return Promise.resolve(
      this.available &&
        typeof Worker !== "undefined" &&
        typeof WebAssembly !== "undefined" &&
        CHORD_TIKZ_WASM_GZIP_BASE64.length > 0 &&
        CHORD_TIKZ_WORKER_SOURCE.length > 0,
    );
  }

  async render(
    source: string,
    signal?: AbortSignal,
  ): Promise<TikzRenderArtifact> {
    if (signal?.aborted) throw abortError();
    await this.initialize();
    const worker = this.worker;
    if (!worker) throw new Error("The Chord TikZ worker did not initialize.");

    const requestId = ++this.requestId;
    return new Promise<TikzRenderArtifact>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.resetWorker(
          requestId,
          new Error("Chord TikZ rendering exceeded the 2 second safety limit."),
        );
      }, 2_000);
      const pending: PendingCompile = {
        resolve,
        reject,
        startedAt: performance.now(),
        timeout,
        signal,
      };
      if (signal) {
        pending.abortHandler = () => {
          this.resetWorker(requestId, abortError());
        };
        signal.addEventListener("abort", pending.abortHandler, { once: true });
      }
      this.pending.set(requestId, pending);
      worker.postMessage({ type: "compile", requestId, source });
    });
  }

  dispose(): void {
    for (const requestId of this.pending.keys()) {
      this.finishWithError(
        requestId,
        new Error("The Chord TikZ backend was disposed."),
      );
    }
    this.worker?.terminate();
    this.worker = null;
    this.initialization = null;
  }

  private async initialize(): Promise<void> {
    if (this.worker) return;
    this.initialization ??= this.createWorker();
    try {
      await this.initialization;
    } catch (error) {
      this.available = false;
      this.dispose();
      throw error;
    }
  }

  private createWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerUrl = URL.createObjectURL(
        new Blob([CHORD_TIKZ_WORKER_SOURCE], { type: "text/javascript" }),
      );
      const worker = new Worker(workerUrl, { name: "Chord TikZ vector engine" });
      this.worker = worker;
      const timeout = window.setTimeout(() => {
        cleanupInitialization();
        reject(new Error("Chord TikZ initialization timed out."));
      }, 10_000);
      const cleanupInitialization = () => {
        window.clearTimeout(timeout);
        URL.revokeObjectURL(workerUrl);
      };

      worker.addEventListener(
        "message",
        (event: MessageEvent<ChordTikzWorkerMessage>) => {
          const message = event.data;
          if (message.type === "ready") {
            if (
              message.protocolVersion !== MATH_CHORDS_TIKZ_PROTOCOL_VERSION
            ) {
              cleanupInitialization();
              reject(new Error("The Chord TikZ worker protocol is incompatible."));
              return;
            }
            cleanupInitialization();
            resolve();
          } else if (message.type === "result") {
            this.finishWithResult(message);
          } else if (message.requestId === undefined) {
            cleanupInitialization();
            reject(new Error(message.message));
          } else {
            this.finishWithError(message.requestId, new Error(message.message));
          }
        },
      );
      worker.addEventListener("error", (event) => {
        cleanupInitialization();
        const error = new Error(`Chord TikZ worker error: ${event.message}`);
        reject(error);
        for (const requestId of this.pending.keys()) {
          this.finishWithError(requestId, error);
        }
      });
      worker.postMessage(
        {
          type: "initialize",
          protocolVersion: MATH_CHORDS_TIKZ_PROTOCOL_VERSION,
          engineVersion: CHORD_TIKZ_ENGINE_VERSION,
          wasmGzipBase64: CHORD_TIKZ_WASM_GZIP_BASE64,
        },
      );
    });
  }

  private finishWithResult(message: ChordTikzResultMessage): void {
    const pending = this.takePending(message.requestId);
    if (!pending) return;
    pending.resolve({
      bytes:
        message.svg instanceof Uint8Array
          ? message.svg
          : new Uint8Array(message.svg),
      mediaType: "image/svg+xml",
      backend: "wasm",
      durationMs: performance.now() - pending.startedAt,
    });
  }

  private finishWithError(requestId: number, error: Error): void {
    this.takePending(requestId)?.reject(error);
  }

  private resetWorker(requestId: number, error: Error): void {
    this.finishWithError(requestId, error);
    const restartError = new Error(
      "Chord TikZ restarted after an earlier render was cancelled.",
    );
    for (const pendingId of this.pending.keys()) {
      this.finishWithError(pendingId, restartError);
    }
    this.worker?.terminate();
    this.worker = null;
    this.initialization = null;
  }

  private takePending(requestId: number): PendingCompile | undefined {
    const pending = this.pending.get(requestId);
    if (!pending) return undefined;
    this.pending.delete(requestId);
    window.clearTimeout(pending.timeout);
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener("abort", pending.abortHandler);
    }
    return pending;
  }
}

function abortError(): Error {
  return new DOMException("TikZ rendering was cancelled.", "AbortError");
}
