import {
  MarkdownRenderChild,
  type MarkdownPostProcessorContext,
} from "obsidian";
import type { TikzBackendMode } from "../settings";
import type { TikzRenderCoordinator } from "./coordinator";
import { TikzPreviewSurface } from "./previewSurface";
import type { TikzFontPreferences } from "./fonts";
import {
  isTikzPrintContainer,
  trackTikzPostProcessorPromise,
} from "./markdownExport";

export interface TikzMarkdownProcessorOptions {
  coordinator: TikzRenderCoordinator;
  getBackend: () => TikzBackendMode;
  getFonts: () => TikzFontPreferences;
  getLocale: () => string;
}

let markdownPreviewId = 0;

export function processTikzCodeBlock(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  options: TikzMarkdownProcessorOptions,
): Promise<void> | void {
  const renderImmediately = isTikzPrintContainer(el);
  const child = new TikzMarkdownRenderChild(
    el,
    source,
    options,
    renderImmediately,
  );
  ctx.addChild(child);
  if (!renderImmediately) return;

  const completion = child.whenRendered();
  trackTikzPostProcessorPromise(ctx, completion);
  return completion;
}

class TikzMarkdownRenderChild extends MarkdownRenderChild {
  private surface: TikzPreviewSurface | null = null;
  private sourceEl: HTMLPreElement | null = null;
  private observer: IntersectionObserver | null = null;
  private readonly completion: Promise<void>;
  private settleCompletion: (() => void) | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly options: TikzMarkdownProcessorOptions,
    private readonly renderImmediately: boolean,
  ) {
    super(containerEl);
    this.completion = new Promise((resolve) => {
      this.settleCompletion = resolve;
    });
  }

  whenRendered(): Promise<void> {
    return this.completion;
  }

  onload(): void {
    this.sourceEl = this.containerEl.createEl("pre");
    this.sourceEl.className = "obsidian-math-chords-tikz-source";
    const codeEl = this.sourceEl.createEl("code");
    codeEl.className = "language-tikz";
    codeEl.setText(this.source);

    this.surface = new TikzPreviewSurface(this.containerEl.ownerDocument, {
      coordinator: this.options.coordinator,
      consumerKey: `markdown-${++markdownPreviewId}`,
      getBackend: this.options.getBackend,
      getFonts: this.options.getFonts,
      getLocale: this.options.getLocale,
      getTheme: () =>
        this.containerEl.ownerDocument.body.classList.contains("theme-dark")
          ? "dark"
          : "light",
      onReady: () => {
        if (!this.surface) return;
        this.sourceEl?.remove();
        this.sourceEl = null;
        this.surface.containerEl.hidden = false;
        this.finish();
      },
      onError: () => {
        if (this.surface) this.surface.containerEl.hidden = false;
        this.finish();
      },
    });
    this.surface.containerEl.hidden = true;
    this.containerEl.replaceChildren(this.sourceEl, this.surface.containerEl);
    if (this.renderImmediately) {
      this.surface.render(this.source, true);
      return;
    }
    const Observer =
      this.containerEl.ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) {
      this.surface.render(this.source, true);
      return;
    }
    this.observer = new Observer(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.observer?.disconnect();
        this.observer = null;
        this.surface?.render(this.source, true);
      },
      { rootMargin: "600px 0px" },
    );
    this.observer.observe(this.containerEl);
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.surface?.destroy();
    this.surface = null;
    this.sourceEl = null;
    this.finish();
  }

  private finish(): void {
    this.settleCompletion?.();
    this.settleCompletion = null;
  }
}
