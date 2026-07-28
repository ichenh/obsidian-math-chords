import type { TikzBackendMode } from "../settings";

export interface TikzRenderRequest {
  source: string;
  backend: TikzBackendMode;
  theme: "light" | "dark";
  fontSignature?: string;
}

export interface TikzRenderArtifact {
  bytes: Uint8Array;
  exportPdfBytes?: Uint8Array;
  mediaType: "application/pdf" | "image/svg+xml";
  backend: Exclude<TikzBackendMode, "auto">;
  durationMs: number;
  log?: string;
}

export interface TikzRenderBackend {
  readonly id: TikzBackendMode;
  isAvailable(): Promise<boolean>;
  render(source: string, signal?: AbortSignal): Promise<TikzRenderArtifact>;
  dispose(): void;
}

export type TikzRenderPhase =
  | "scheduled"
  | "rendering"
  | "ready"
  | "error";

export interface TikzRenderState {
  phase: TikzRenderPhase;
  artifact?: TikzRenderArtifact;
  error?: Error;
  cached?: boolean;
}

export interface TikzRenderSubscription {
  cancel(): void;
}
