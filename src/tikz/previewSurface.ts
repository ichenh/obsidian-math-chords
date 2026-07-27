import type { TikzBackendMode } from "../settings";
import { renderTikzArtifact } from "./renderArtifact";
import { tikzAccessibleName } from "./accessibility";
import type { TikzRenderCoordinator } from "./coordinator";
import type {
  TikzRenderArtifact,
  TikzRenderState,
  TikzRenderSubscription,
} from "./types";
import {
  tikzFontSignature,
  type TikzFontPreferences,
} from "./fonts";
import { hashTikzRenderInput } from "./hash";

const activeSurfaces = new Set<TikzPreviewSurface>();

export function refreshActiveTikzPreviews(force = false): void {
  for (const surface of activeSurfaces) surface.refresh(force);
}

export interface TikzPreviewSurfaceOptions {
  coordinator: TikzRenderCoordinator;
  consumerKey: string;
  getBackend: () => TikzBackendMode;
  getTheme: () => "light" | "dark";
  getFonts: () => TikzFontPreferences;
  getLocale: () => string;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export class TikzPreviewSurface {
  readonly containerEl: HTMLElement;
  private outputEl: HTMLElement;
  private subscription: TikzRenderSubscription | null = null;
  private renderGeneration = 0;
  private source = "";
  private requestKey = "";
  private latestArtifact: TikzRenderArtifact | null = null;

  constructor(
    ownerDocument: Document,
    private readonly options: TikzPreviewSurfaceOptions,
  ) {
    this.containerEl = ownerDocument.createElement("div");
    this.containerEl.className = "obsidian-math-chords-tikz-preview";
    this.outputEl = this.containerEl.createDiv({
      cls: "obsidian-math-chords-tikz-preview-output",
    });
    activeSurfaces.add(this);
  }

  render(source: string, immediate = false): void {
    this.source = source;
    const fonts = this.options.getFonts();
    const requestKey = hashTikzRenderInput([
      source,
      this.options.getBackend(),
      this.options.getTheme(),
      tikzFontSignature(fonts),
    ].join("\0"));
    if (requestKey === this.requestKey) return;
    this.requestKey = requestKey;
    this.subscription?.cancel();
    const generation = ++this.renderGeneration;
    this.subscription = this.options.coordinator.request(
      this.options.consumerKey,
      {
        source,
        backend: this.options.getBackend(),
        theme: this.options.getTheme(),
        fontSignature: tikzFontSignature(fonts),
      },
      (state) => {
        void this.applyState(state, generation);
      },
      immediate ? 0 : undefined,
    );
  }

  destroy(): void {
    activeSurfaces.delete(this);
    this.subscription?.cancel();
    this.subscription = null;
    this.requestKey = "";
    this.renderGeneration++;
  }

  refresh(force = false): void {
    if (force) this.requestKey = "";
    if (this.source) this.render(this.source, force);
  }

  getExportData(): {
    artifact: TikzRenderArtifact;
    outputEl: HTMLElement;
  } | null {
    return this.latestArtifact
      ? { artifact: this.latestArtifact, outputEl: this.outputEl }
      : null;
  }

  private async applyState(
    state: TikzRenderState,
    generation: number,
  ): Promise<void> {
    if (generation !== this.renderGeneration) return;
    if (state.phase === "scheduled" || state.phase === "rendering") {
      if (!this.latestArtifact && this.outputEl.childElementCount === 0) {
        this.showSource();
      }
      return;
    }
    if (state.phase === "error") {
      const error = state.error ?? new Error("Unknown TikZ rendering error.");
      if (!this.latestArtifact) this.showError(error);
      this.options.onError?.(error);
      return;
    }
    if (!state.artifact) return;

    const previousOutput = this.outputEl;
    const renderTarget = this.latestArtifact
      ? this.createStagingOutput(previousOutput)
      : previousOutput;
    try {
      await renderTikzArtifact(
        state.artifact,
        renderTarget,
        this.options.getFonts(),
        this.options.getLocale(),
        tikzAccessibleName(this.source),
      );
      if (generation !== this.renderGeneration) {
        if (renderTarget !== previousOutput) renderTarget.remove();
        return;
      }
      if (renderTarget !== previousOutput) {
        renderTarget.removeClass("is-staging");
        renderTarget.removeAttribute("style");
        previousOutput.replaceWith(renderTarget);
        this.outputEl = renderTarget;
      }
      this.latestArtifact = state.artifact;
      this.options.onReady?.();
    } catch (error) {
      if (renderTarget !== previousOutput) renderTarget.remove();
      if (generation !== this.renderGeneration) return;
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (!this.latestArtifact) this.showError(normalized);
      this.options.onError?.(normalized);
    }
  }

  private showError(error: Error): void {
    const message = error.message.split(/\r?\n/).slice(-6).join("\n");
    const errorEl = this.outputEl.ownerDocument.createElement("pre");
    errorEl.className = "obsidian-math-chords-tikz-preview-error";
    errorEl.setText(message);
    this.outputEl.replaceChildren(errorEl);
  }

  private showSource(): void {
    const sourceEl = this.outputEl.ownerDocument.createElement("pre");
    sourceEl.className = "obsidian-math-chords-tikz-preview-source";
    sourceEl.setText(this.source);
    this.outputEl.replaceChildren(sourceEl);
  }

  private createStagingOutput(previousOutput: HTMLElement): HTMLElement {
    const rect = previousOutput.getBoundingClientRect();
    const staging = previousOutput.ownerDocument.createElement("div");
    staging.className = previousOutput.className;
    staging.addClass("is-staging");
    staging.setCssProps({
      "--obsidian-math-chords-tikz-staging-width":
        `${Math.max(1, rect.width)}px`,
      "--obsidian-math-chords-tikz-staging-height":
        `${Math.max(1, rect.height)}px`,
    });
    previousOutput.ownerDocument.body.appendChild(staging);
    return staging;
  }
}
