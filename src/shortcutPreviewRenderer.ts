import { finishRenderMath, loadMathJax, renderMath } from "obsidian";
import { buildShortcutPreview } from "./shortcutPresentation";

interface PreviewRequestBase {
  containerEl: HTMLElement;
}

export type ShortcutPreviewRequest = PreviewRequestBase & ({
  command: string;
  latex?: never;
} | {
  command?: never;
  latex: string;
});

export function scheduleShortcutPreviews(
  requests: ShortcutPreviewRequest[],
  ownerEl: HTMLElement,
): () => void {
  const ownerWindow = ownerEl.ownerDocument.defaultView;
  let disposed = false;
  let observer: IntersectionObserver | null = null;
  let batchTimer: number | null = null;
  let finishTimer: number | null = null;

  const isCurrent = (): boolean => !disposed && Boolean(ownerEl.parentElement);
  const scheduleFinish = (): void => {
    if (!ownerWindow || finishTimer !== null) return;
    finishTimer = ownerWindow.setTimeout(() => {
      finishTimer = null;
      if (!isCurrent()) return;
      void finishRenderMath().catch(() => {
        // Names and LaTeX source remain visible if stylesheet flushing fails.
      });
    }, 0);
  };
  const renderRequest = (request: ShortcutPreviewRequest): void => {
    const { containerEl } = request;
    if (!isCurrent() || !containerEl.parentElement) return;
    containerEl.empty();
    if (request.latex !== undefined) renderLatexPreview(containerEl, request.latex);
    else renderShortcutPreview(containerEl, request.command);
    scheduleFinish();
  };

  void (async () => {
    try {
      await loadMathJax();
    } catch {
      if (!isCurrent()) return;
      for (const { containerEl } of requests) {
        if (!containerEl.parentElement) continue;
        containerEl.empty();
        containerEl.createSpan({ text: "—" });
      }
      return;
    }

    if (!isCurrent()) return;
    const Observer = ownerWindow?.IntersectionObserver;
    if (Observer) {
      const byElement = new Map(requests.map((request) => [request.containerEl, request]));
      observer = new Observer(
        (entries) => {
          if (!isCurrent()) {
            observer?.disconnect();
            return;
          }
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer?.unobserve(entry.target);
            const request = byElement.get(entry.target as HTMLElement);
            if (request) renderRequest(request);
          }
        },
        { rootMargin: "240px 0px" },
      );
      for (const request of requests) observer.observe(request.containerEl);
      return;
    }

    let cursor = 0;
    const renderBatch = (): void => {
      if (!isCurrent()) return;
      const end = Math.min(cursor + 12, requests.length);
      for (; cursor < end; cursor++) renderRequest(requests[cursor]);
      if (cursor < requests.length && ownerWindow) {
        batchTimer = ownerWindow.setTimeout(renderBatch, 0);
      }
    };
    renderBatch();
  })();

  return () => {
    disposed = true;
    observer?.disconnect();
    if (ownerWindow && batchTimer !== null) ownerWindow.clearTimeout(batchTimer);
    if (ownerWindow && finishTimer !== null) ownerWindow.clearTimeout(finishTimer);
  };
}

function renderShortcutPreview(containerEl: HTMLElement, command: string): void {
  const preview = buildShortcutPreview(command);
  if (preview.fallback) {
    containerEl.createEl("code", { text: preview.fallback });
    return;
  }
  if (!preview.latex) {
    containerEl.createSpan({ text: "—" });
    return;
  }

  renderLatexPreview(containerEl, preview.latex);
}

function renderLatexPreview(containerEl: HTMLElement, latex: string): void {
  try {
    const mathEl = renderMath(latex, false);
    mathEl.addClass("obsidian-math-chords-shortcut-preview-math");
    containerEl.appendChild(mathEl);
  } catch {
    containerEl.createSpan({ text: "—" });
  }
}
