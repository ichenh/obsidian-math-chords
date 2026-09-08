import { afterEach, describe, expect, it, vi } from "vitest";
import {
  refreshActiveTikzPreviews,
  TikzPreviewSurface,
} from "../../src/tikz/previewSurface";
import { renderTikzArtifact } from "../../src/tikz/renderArtifact";
import { EMPTY_TIKZ_FONT_PREFERENCES } from "../../src/tikz/fonts";
import type { TikzRenderCoordinator } from "../../src/tikz/coordinator";
import type {
  TikzRenderArtifact,
  TikzRenderRequest,
  TikzRenderState,
} from "../../src/tikz/types";

vi.mock("../../src/tikz/renderArtifact", () => ({
  renderTikzArtifact: vi.fn(),
}));


// Only model the DOM ownership operations used by the preview surface. The
// renderer is deferred so tests can control PDF/MathJax completion order.
class TestElement {
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  className = "";
  textContent = "";
  removeAttribute = vi.fn();
  setCssProps = vi.fn();

  constructor(readonly ownerDocument: TestDocument) {}

  get childElementCount(): number {
    return this.children.length;
  }

  createDiv(options?: { cls: string }): TestElement {
    const child = new TestElement(this.ownerDocument);
    child.className = options?.cls ?? "";
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  createEl(): TestElement {
    return this.createDiv();
  }

  setText(text: string): void {
    this.textContent = text;
  }

  detach(): void {
    this.remove();
  }

  remove(): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }

  replaceWith(replacement: TestElement): void {
    if (!this.parentElement) return;
    replacement.remove();
    const parent = this.parentElement;
    parent.children.splice(parent.children.indexOf(this), 1, replacement);
    replacement.parentElement = parent;
    this.parentElement = null;
  }

  replaceChildren(...children: TestElement[]): void {
    for (const child of [...this.children]) child.remove();
    for (const child of children) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    }
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: 480, height: 300 };
  }

  addClass(name: string): void {
    this.className = `${this.className} ${name}`;
  }

  removeClass(name: string): void {
    this.className = this.className.split(" ").filter((value) => value !== name).join(" ");
  }
}

class TestDocument {
  readonly body = new TestElement(this);
}

const surfaces: TikzPreviewSurface[] = [];

afterEach(() => {
  for (const surface of surfaces.splice(0)) surface.destroy();
  vi.resetAllMocks();
});

function setup() {
  const document = new TestDocument();
  const listeners: ((state: TikzRenderState) => void)[] = [];
  const cancellations: (() => void)[] = [];
  const request = vi.fn((
    _consumer: string,
    _input: unknown,
    onState: (state: TikzRenderState) => void,
  ) => {
    listeners.push(onState);
    onState({ phase: "scheduled" });
    const cancel = vi.fn();
    cancellations.push(cancel);
    return { cancel };
  });
  const onReady = vi.fn();
  const onError = vi.fn();
  const preferences = {
    backend: "wasm" as TikzRenderRequest["backend"],
    theme: "light" as TikzRenderRequest["theme"],
    fonts: { ...EMPTY_TIKZ_FONT_PREFERENCES },
    locale: "en",
  };
  const surface = new TikzPreviewSurface(document as unknown as Document, {
    coordinator: { request } as unknown as TikzRenderCoordinator,
    consumerKey: "test-preview",
    getBackend: () => preferences.backend,
    getTheme: () => preferences.theme,
    getFonts: () => preferences.fonts,
    getLocale: () => preferences.locale,
    onReady,
    onError,
  });
  surfaces.push(surface);
  const container = surface.containerEl as unknown as TestElement;
  return { surface, document, container, listeners, request, cancellations, onReady, onError, preferences };
}

function deferRender(label: string) {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  vi.mocked(renderTikzArtifact).mockImplementationOnce(async (_artifact, output) => {
    await promise;
    const target = output as unknown as TestElement;
    const diagram = target.createDiv();
    diagram.setText(label);
    target.replaceChildren(diagram);
  });
  return { resolve, reject };
}

function artifact(): TikzRenderArtifact {
  return {
    bytes: new Uint8Array(),
    mediaType: "image/svg+xml",
    backend: "wasm",
    durationMs: 1,
  };
}

async function flushRender(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TikZ preview surface", () => {
  it.each(["scheduled", "layout"])(
    "cancels a hidden preview during %s and resumes the same source on demand",
    async (phase) => {
      const { surface, listeners, request, cancellations, onReady } = setup();
      const completed = deferRender("hidden");
      surface.render("source");
      if (phase === "layout") {
        listeners[0]({ phase: "ready", artifact: artifact() });
      }

      surface.suspend();
      surface.suspend();
      expect(cancellations[0]).toHaveBeenCalledOnce();
      refreshActiveTikzPreviews(true);
      surface.refresh(true);
      expect(request).toHaveBeenCalledOnce();
      completed.resolve();
      await flushRender();
      expect(onReady).not.toHaveBeenCalled();

      surface.render("source", true);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[1][1]).toMatchObject({ source: "source" });
    },
  );

  it("reuses a finished preview on reopening and applies settings changed while hidden", async () => {
    const { surface, listeners, request, preferences } = setup();
    const completed = deferRender("finished");
    surface.render("source");
    const finishedArtifact = artifact();
    listeners[0]({ phase: "ready", artifact: finishedArtifact });
    completed.resolve();
    await flushRender();

    surface.suspend();
    refreshActiveTikzPreviews(true);
    surface.render("source", true);
    expect(request).toHaveBeenCalledOnce();
    expect(surface.getExportData()?.artifact).toBe(finishedArtifact);

    surface.suspend();
    preferences.theme = "dark";
    refreshActiveTikzPreviews(true);
    expect(request).toHaveBeenCalledOnce();
    surface.render("source", true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toMatchObject({ theme: "dark" });
  });

  it.each(["backend", "theme", "font", "locale"])(
    "refreshes unchanged source when its %s changes",
    (preference) => {
      const { surface, request, cancellations, preferences } = setup();
      surface.render("same source");
      if (preference === "backend") preferences.backend = "native";
      if (preference === "theme") preferences.theme = "dark";
      if (preference === "font") preferences.fonts.latin = "Latin Modern Roman";
      if (preference === "locale") preferences.locale = "zh-CN";
      surface.refresh();
      surface.refresh();

      expect(request).toHaveBeenCalledTimes(2);
      expect(cancellations[0]).toHaveBeenCalledOnce();
    },
  );

  it("keeps the latest diagram when an earlier initial render finishes last", async () => {
    const { surface, container, listeners, onReady, onError } = setup();
    const oldRender = deferRender("old");
    const newRender = deferRender("new");
    surface.render("old");
    listeners[0]({ phase: "ready", artifact: artifact() });
    surface.render("new");
    const latestArtifact = artifact();
    listeners[1]({ phase: "ready", artifact: latestArtifact });

    newRender.resolve();
    await flushRender();
    oldRender.resolve();
    await flushRender();

    expect(container.children[0].children[0].textContent).toBe("new");
    expect(surface.getExportData()?.artifact).toBe(latestArtifact);
    expect(surface.getExportData()?.outputEl).toBe(container.children[0]);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the completed diagram when its replacement fails", async () => {
    const { surface, container, listeners, onReady, onError, request } = setup();
    const initial = deferRender("initial");
    surface.render("initial");
    const initialArtifact = artifact();
    listeners[0]({ phase: "ready", artifact: initialArtifact });
    initial.resolve();
    await flushRender();

    const replacement = deferRender("replacement");
    surface.render("replacement");
    listeners[1]({ phase: "ready", artifact: artifact() });
    expect(container.children[0].children[0].textContent).toBe("initial");
    const error = new Error("PDF layout failed");
    replacement.reject(error);
    await flushRender();

    expect(container.children[0].children[0].textContent).toBe("initial");
    expect(surface.getExportData()?.artifact).toBe(initialArtifact);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    surface.refresh();
    expect(request).toHaveBeenCalledTimes(2);
    surface.suspend();
    surface.render("replacement");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("retries a backend failure on reopening without retrying every view update", () => {
    const { surface, listeners, request } = setup();
    surface.render("diagram");
    listeners[0]({ phase: "error", error: new Error("Temporary backend failure") });
    surface.refresh();
    surface.refresh();
    expect(request).toHaveBeenCalledOnce();
    surface.suspend();
    refreshActiveTikzPreviews();
    expect(request).toHaveBeenCalledOnce();
    surface.render("diagram");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("removes abandoned staging outputs before their render promises settle", async () => {
    const { surface, document, listeners, onReady } = setup();
    const initial = deferRender("initial");
    surface.render("initial");
    listeners[0]({ phase: "ready", artifact: artifact() });
    initial.resolve();
    await flushRender();

    const superseded = deferRender("superseded");
    surface.render("superseded");
    listeners[1]({ phase: "ready", artifact: artifact() });
    expect(document.body.children).toHaveLength(1);
    surface.render("latest");
    expect(document.body.children).toHaveLength(0);

    const latest = deferRender("latest");
    listeners[2]({ phase: "ready", artifact: artifact() });
    expect(document.body.children).toHaveLength(1);
    // A stale completion must not clear the newer generation's pending output.
    superseded.resolve();
    await flushRender();
    surface.destroy();
    expect(document.body.children).toHaveLength(0);
    latest.resolve();
    await flushRender();
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("ignores errors from superseded renders and reuses unchanged requests", async () => {
    const { surface, container, listeners, request, onError } = setup();
    const oldRender = deferRender("old");
    surface.render("old");
    listeners[0]({ phase: "ready", artifact: artifact() });
    const newRender = deferRender("new");
    surface.render("new");
    listeners[1]({ phase: "ready", artifact: artifact() });
    newRender.resolve();
    await flushRender();
    oldRender.reject(new Error("late failure"));
    await flushRender();
    surface.render("new");

    expect(request).toHaveBeenCalledTimes(2);
    expect(renderTikzArtifact).toHaveBeenCalledTimes(2);
    expect(container.children[0].children[0].textContent).toBe("new");
    expect(onError).not.toHaveBeenCalled();
  });
});
