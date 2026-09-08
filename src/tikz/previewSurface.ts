import type { TikzBackendMode } from "../settings";
import { renderTikzArtifact } from "./renderArtifact";
import { tikzAccessibleName } from "./accessibility";
import type { TikzRenderCoordinator } from "./coordinator";
import type {
  TikzRenderArtifact,
  TikzRenderRequest,
  TikzRenderState,
  TikzRenderSubscription,
} from "./types";
import {
  tikzFontSignature,
  type TikzFontPreferences,
} from "./fonts";

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
  private request: TikzRenderRequest | null = null;
  private locale = "";
  private renderPending = false;
  private renderFailed = false;
  private latestArtifact: TikzRenderArtifact | null = null;
  private pendingOutput: HTMLElement | null = null;

  constructor(
    ownerDocument: Document,
    private readonly options: TikzPreviewSurfaceOptions,
  ) {
    this.containerEl = ownerDocument.body.createDiv();
    this.containerEl.detach();
    this.containerEl.className = "obsidian-math-chords-tikz-preview";
    this.outputEl = this.containerEl.createDiv({
      cls: "obsidian-math-chords-tikz-preview-output",
    });
    activeSurfaces.add(this);
  }

  render(source: string, immediate = false): void {
    activeSurfaces.add(this);
    this.source = source;
    const fonts = this.options.getFonts();
    const request: TikzRenderRequest = {
      source,
      backend: this.options.getBackend(),
      theme: this.options.getTheme(),
      fontSignature: tikzFontSignature(fonts),
    };
    const locale = this.options.getLocale();
    if (
      this.request?.source === request.source &&
      this.request.backend === request.backend &&
      this.request.theme === request.theme &&
      this.request.fontSignature === request.fontSignature &&
      this.locale === locale
    ) return;
    this.request = request;
    this.locale = locale;
    this.subscription?.cancel();
    this.subscription = null;
    const generation = ++this.renderGeneration;
    this.clearPendingOutput();
    this.renderPending = true;
    this.renderFailed = false;
    this.subscription = this.options.coordinator.request(
      this.options.consumerKey,
      request,
      (state) => {
        void this.applyState(state, generation);
      },
      immediate ? 0 : undefined,
    );
  }

  suspend(): void {
    activeSurfaces.delete(this);
    if (!this.renderPending && !this.renderFailed) return;
    this.subscription?.cancel();
    this.subscription = null;
    this.request = null;
    this.renderPending = false;
    this.renderGeneration++;
    this.clearPendingOutput();
  }

  destroy(): void {
    activeSurfaces.delete(this);
    this.subscription?.cancel();
    this.subscription = null;
    this.request = null;
    this.renderPending = false;
    this.renderGeneration++;
    this.clearPendingOutput();
  }

  refresh(force = false): void {
    if (!activeSurfaces.has(this)) return;
    if (force) this.request = null;
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
      this.renderPending = false;
      this.renderFailed = true;
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
    this.pendingOutput = renderTarget;
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
      this.pendingOutput = null;
      this.renderPending = false;
      this.options.onReady?.();
    } catch (error) {
      if (renderTarget !== previousOutput) renderTarget.remove();
      if (generation !== this.renderGeneration) return;
      this.renderPending = false;
      this.renderFailed = true;
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (!this.latestArtifact) this.showError(normalized);
      this.options.onError?.(normalized);
    } finally {
      if (this.pendingOutput === renderTarget) this.pendingOutput = null;
    }
  }

  private clearPendingOutput(): void {
    const pendingOutput = this.pendingOutput;
    if (!pendingOutput) return;
    this.pendingOutput = null;
    // An initial render writes into the visible output. Detach that output
    // before another generation can use it, including while PDF/MathJax waits.
    if (pendingOutput === this.outputEl) {
      const replacement = this.containerEl.createDiv({
        cls: "obsidian-math-chords-tikz-preview-output",
      });
      pendingOutput.replaceWith(replacement);
      this.outputEl = replacement;
    }
    pendingOutput.remove();
  }

  private showError(error: Error): void {
    const message = error.message.split(/\r?\n/).slice(-6).join("\n");
    const errorEl = this.outputEl.createEl("pre");
    errorEl.className = "obsidian-math-chords-tikz-preview-error";
    errorEl.setText(message);
    this.outputEl.replaceChildren(errorEl);
  }

  private showSource(): void {
    const sourceEl = this.outputEl.createEl("pre");
    sourceEl.className = "obsidian-math-chords-tikz-preview-source";
    sourceEl.setText(this.source);
    this.outputEl.replaceChildren(sourceEl);
  }

  private createStagingOutput(previousOutput: HTMLElement): HTMLElement {
    const rect = previousOutput.getBoundingClientRect();
    const staging = previousOutput.ownerDocument.body.createDiv();
    staging.className = previousOutput.className;
    staging.addClass("is-staging");
    staging.setCssProps({
      "--obsidian-math-chords-tikz-staging-width":
        `${Math.max(1, rect.width)}px`,
      "--obsidian-math-chords-tikz-staging-height":
        `${Math.max(1, rect.height)}px`,
    });
    return staging;
  }
}
