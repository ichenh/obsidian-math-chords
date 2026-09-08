import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform, type MarkdownPostProcessorContext } from "obsidian";
import { processTikzCodeBlock } from "../../src/tikz/markdownProcessor";
import type { TikzPreviewSurfaceOptions } from "../../src/tikz/previewSurface";
import type { TikzRenderCoordinator } from "../../src/tikz/coordinator";
import { EMPTY_TIKZ_FONT_PREFERENCES } from "../../src/tikz/fonts";

vi.mock("../../src/l10n/locale", () => ({ t: () => "TikZ rendering" }));

vi.mock("obsidian", () => ({
  Platform: { isDesktop: true },
  MarkdownRenderChild: class {
    constructor(readonly containerEl: HTMLElement) {}
  },
}));

const surface = vi.hoisted(() => ({
  options: null as TikzPreviewSurfaceOptions | null,
  render: vi.fn(),
  destroy: vi.fn(),
  getExportData: vi.fn(),
  attachControls: vi.fn(),
  destroyControls: vi.fn(),
}));

vi.mock("../../src/tikz/blockExport", () => ({
  TikzBlockExportControls: class {
    destroy = surface.destroyControls;
    constructor(host: HTMLElement, getData: () => unknown) {
      surface.attachControls(host, getData);
    }
  },
}));

vi.mock("../../src/tikz/previewSurface", () => ({
  TikzPreviewSurface: class {
    readonly containerEl: HTMLElement;
    render = surface.render;
    destroy = surface.destroy;
    getExportData = surface.getExportData;
    constructor(document: Document, options: TikzPreviewSurfaceOptions) {
      this.containerEl = document.body.createDiv();
      surface.options = options;
    }
  },
}));

// Only model the processor's DOM and lifecycle; render completion is controlled
// separately so a slow compiler behaves the same as a cache hit in these tests.
class TestElement {
  children: TestElement[] = [];
  parent: TestElement | null = null;
  className = "";
  textContent = "";
  hidden = false;
  attributes = new Map<string, string>();
  closest = vi.fn((): object | null => null);

  constructor(readonly ownerDocument: TestDocument) {}
  createDiv(): TestElement { return this.createEl(); }
  createEl(): TestElement {
    const child = new TestElement(this.ownerDocument);
    child.parent = this;
    this.children.push(child);
    return child;
  }
  addClass(name: string): void { this.className += ` ${name}`; }
  removeClass(name: string): void {
    this.className = this.className.split(" ").filter((item) => item !== name).join(" ");
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  setText(text: string): void { this.empty(); this.textContent = text; }
  empty(): void {
    for (const child of [...this.children]) child.remove();
    this.textContent = "";
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...children: TestElement[]): void {
    this.empty();
    for (const child of children) {
      child.remove();
      child.parent = this;
      this.children.push(child);
    }
  }
}

class TestDocument {
  body = new TestElement(this);
  defaultView: { IntersectionObserver?: typeof IntersectionObserver } = {};
}

afterEach(() => { vi.clearAllMocks(); surface.options = null; Platform.isDesktop = true; });

function setup(print = false, lazy = false) {
  const document = new TestDocument();
  let intersect!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  if (lazy) {
    document.defaultView.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe = observe;
      disconnect = disconnect;
    } as unknown as typeof IntersectionObserver;
  }
  const container = document.body.createDiv();
  if (print) container.closest.mockReturnValue({});
  let child!: { onload(): void; onunload(): void };
  const source = Array.from({ length: 500 }, (_, i) => `\\draw (${i},0) -- (0,1);`).join("\n");
  const completion = processTikzCodeBlock(source, container as unknown as HTMLElement, {
    addChild(value: typeof child) { child = value; child.onload(); },
  } as unknown as MarkdownPostProcessorContext, {
    coordinator: {} as TikzRenderCoordinator,
    getBackend: () => "wasm",
    getFonts: () => EMPTY_TIKZ_FONT_PREFERENCES,
    getLocale: () => "en",
  });
  return {
    container, source, completion, child, observe, disconnect,
    enterViewport: () => intersect(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  };
}

describe("TikZ Markdown loading layout", () => {
  it("uses the Live Preview wrapper and resolves the latest completed diagram when downloading", () => {
    const { container, child } = setup();
    const host = container.ownerDocument.body.createDiv();
    container.closest.mockReturnValue(host);
    surface.options?.onReady?.();
    expect(surface.attachControls.mock.calls[0][0]).toBe(host);
    const getData = surface.attachControls.mock.calls[0][1] as () => unknown;
    const data = { diagram: "latest" };
    surface.getExportData.mockReturnValue(data);
    expect(getData()).toBe(data);
    child.onunload();
    expect(getData()).toBeNull();
  });

  it("does not expose desktop file export on mobile", () => {
    Platform.isDesktop = false;
    const { child } = setup();
    surface.options?.onReady?.();
    expect(surface.attachControls).not.toHaveBeenCalled();
    child.onunload();
  });

  it("keeps a long source out of the pending note layout and removes the placeholder on success", () => {
    const { container, source, child } = setup();
    const placeholder = container.children[0];
    expect(placeholder.textContent).toBe("TikZ rendering…");
    expect(placeholder.textContent).not.toContain(source);
    expect(placeholder.children).toHaveLength(0);
    expect(placeholder.attributes.get("aria-busy")).toBe("true");
    expect(container.children[1].hidden).toBe(true);
    expect(surface.render).toHaveBeenCalledWith(source, true);

    surface.options?.onReady?.();
    expect(container.children).toHaveLength(1);
    expect(container.children[0].hidden).toBe(false);
    expect(surface.attachControls).toHaveBeenCalledOnce();
    expect(surface.attachControls.mock.calls[0][0]).toBe(container);
    surface.options?.onReady?.();
    expect(surface.attachControls).toHaveBeenCalledOnce();
    child.onunload();
    expect(surface.destroy).toHaveBeenCalledOnce();
    expect(surface.destroyControls).toHaveBeenCalledOnce();
  });

  it("restores the complete source and exposes the error surface after a failed render", () => {
    const { container, source, child } = setup();
    surface.options?.onError?.(new Error("compile failed"));
    const sourceEl = container.children[0];
    expect(sourceEl.className).not.toContain("is-loading");
    expect(sourceEl.attributes.has("aria-busy")).toBe(false);
    expect(sourceEl.children[0].textContent).toBe(source);
    expect(sourceEl.children[0].className).toBe("language-tikz");
    expect(container.children[1].hidden).toBe(false);
    expect(surface.attachControls).not.toHaveBeenCalled();
    child.onunload();
  });

  it("retains lazy rendering while offscreen and disconnects on unload", () => {
    const { source, enterViewport, observe, disconnect, child } = setup(false, true);
    expect(observe).toHaveBeenCalledOnce();
    expect(surface.render).not.toHaveBeenCalled();
    enterViewport();
    expect(surface.render).toHaveBeenCalledWith(source, true);
    expect(disconnect).toHaveBeenCalledOnce();
    child.onunload();
  });

  it.each(["ready", "error", "unload"])("waits for %s before completing a print render", async (outcome) => {
    const { completion, child } = setup(true, true);
    expect(surface.render).toHaveBeenCalledOnce();
    const settled = vi.fn();
    void completion?.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    if (outcome === "ready") surface.options?.onReady?.();
    if (outcome === "error") surface.options?.onError?.(new Error("compile failed"));
    child.onunload();
    await completion;
    expect(settled).toHaveBeenCalledOnce();
    expect(surface.attachControls).not.toHaveBeenCalled();
  });
});
