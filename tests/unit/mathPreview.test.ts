import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { finishRenderMath, renderMath } from "obsidian";
import { createInlineMathPreviewPlugin } from "../../src/mathPreview";
import { logAndNotice } from "../../src/errors";

vi.mock("@codemirror/view", () => ({ ViewPlugin: { fromClass: (plugin: unknown) => plugin } }));
vi.mock("obsidian", () => ({ editorLivePreviewField: {}, renderMath: vi.fn(), finishRenderMath: vi.fn() }));
vi.mock("../../src/l10n/locale", () => ({ t: (key: string) => key }));
vi.mock("../../src/errors", () => ({ logAndNotice: vi.fn() }));

class Rect {
  constructor(readonly left: number, readonly top: number, readonly width: number, readonly height: number) {}
  get right() { return this.left + this.width; }
  get bottom() { return this.top + this.height; }
}

// Small host fixture for render counts and lifecycle scheduling, not visual QA.
class ElementFixture {
  children: ElementFixture[] = [];
  classes = new Set<string>();
  offsetHeight = 20;
  scrollWidth = 80;
  setCssProps = vi.fn();
  remove = vi.fn();
  constructor(readonly ownerDocument: DocumentFixture) {}
  createDiv(options: { cls: string; text?: string }) {
    const child = new ElementFixture(this.ownerDocument);
    for (const name of options.cls.split(" ")) child.classes.add(name);
    this.children.push(child);
    return child;
  }
  addClass(name: string) { this.classes.add(name); }
  removeClass(name: string) { this.classes.delete(name); }
  hasClass(name: string) { return this.classes.has(name); }
  toggleClass(name: string, enabled: boolean) { if (enabled) this.addClass(name); else this.removeClass(name); }
  empty() { this.children = []; }
  appendChild(child: ElementFixture) { this.children.push(child); }
  querySelector(selector: string): ElementFixture | null {
    return this.children.find((child) => child.hasClass(selector.slice(1))) ?? null;
  }
  instanceOf() { return true; }
  getBoundingClientRect() { return new Rect(0, 0, 80, 20); }
}

class DocumentFixture {
  frames = new Map<number, () => void>();
  timers = new Map<number, () => void>();
  nextFrame = 0;
  nextTimer = 0;
  defaultView = {
    innerWidth: 1000,
    innerHeight: 800,
    requestAnimationFrame: (callback: () => void) => {
      const id = ++this.nextFrame;
      this.frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => this.frames.delete(id),
    setTimeout: (callback: () => void) => {
      const id = ++this.nextTimer;
      this.timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => this.timers.delete(id),
  };
  body = new ElementFixture(this);
  createRange() { return {}; }
  runFrame() {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    for (const callback of callbacks) callback();
  }
  async runTimers() {
    const callbacks = [...this.timers.values()];
    this.timers.clear();
    for (const callback of callbacks) callback();
    await Promise.resolve();
  }
}

interface TestPlugin { update(update: ViewUpdate): void; destroy(): void }
const plugins: TestPlugin[] = [];
beforeEach(() => {
  vi.stubGlobal("DOMRect", Rect);
  vi.stubGlobal("HTMLElement", ElementFixture);
});
afterEach(() => {
  for (const plugin of plugins.splice(0)) plugin.destroy();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function setup(source = "$x + y$ after") {
  const document = new DocumentFixture();
  vi.mocked(renderMath).mockImplementation(() => {
    const math = new ElementFixture(document);
    math.addClass("mjx-container");
    return math as unknown as HTMLElement;
  });
  const context = { enabled: true, active: true };
  const view = {
    dom: new ElementFixture(document),
    state: EditorState.create({ doc: source, selection: { anchor: 2 } }),
    coordsAtPos: vi.fn(() => new Rect(100, 100, 60, 20)),
  };
  const Plugin = createInlineMathPreviewPlugin({
    isEnabled: () => context.enabled,
    isActiveView: () => context.active,
  }) as unknown as new (view: EditorView) => TestPlugin;
  const plugin = new Plugin(view as unknown as EditorView);
  plugins.push(plugin);
  const update = (flags: Partial<ViewUpdate> = { selectionSet: true }) => {
    plugin.update({ ...flags, view } as unknown as ViewUpdate);
    document.runFrame();
  };
  return { document, view, context, plugin, update, host: document.body.children[0] };
}

describe("inline math preview work reuse", () => {
  it("repositions unchanged math without copying the document or restarting MathJax", () => {
    const { view, update, host, document } = setup();
    const flatten = vi.spyOn(view.state.doc, "toString");
    update();
    update({ selectionSet: true });
    view.coordsAtPos.mockReturnValue(new Rect(200, 200, 60, 20));
    update({ viewportChanged: true });
    update({ geometryChanged: true });
    expect(flatten).toHaveBeenCalledOnce();
    expect(renderMath).toHaveBeenCalledExactlyOnceWith("x + y", false);
    expect(document.timers.size).toBe(1);
    expect(host.setCssProps).toHaveBeenLastCalledWith({ "--mc-preview-left": "200px" });
    view.state = view.state.update({ changes: { from: 1, to: 6, insert: "z" } }).state;
    update({ docChanged: true });
    expect(renderMath).toHaveBeenLastCalledWith("z", false);
    expect(renderMath).toHaveBeenCalledTimes(2);
  });

  it("checks the size guard before flattening a large note", () => {
    const { view, update } = setup("a".repeat(100_001));
    const flatten = vi.spyOn(view.state.doc, "toString");
    update();
    expect(flatten).not.toHaveBeenCalled();
    expect(renderMath).not.toHaveBeenCalled();
  });

  it("cancels pending typesetting when hidden and renders again on reopening", () => {
    const { context, update, host, document } = setup();
    update();
    context.active = false;
    update();
    expect(document.timers.size).toBe(0);
    expect(host.hasClass("is-hidden")).toBe(true);
    context.active = true;
    update();
    expect(renderMath).toHaveBeenCalledTimes(2);
    expect(host.hasClass("is-hidden")).toBe(false);
  });

  it("ignores an old typesetting failure after the formula has changed", async () => {
    const { view, update, document } = setup();
    let reject!: (error: Error) => void;
    vi.mocked(finishRenderMath).mockReturnValueOnce(new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    update();
    await document.runTimers();
    view.state = view.state.update({ changes: { from: 1, to: 6, insert: "z" } }).state;
    update({ docChanged: true });
    reject(new Error("stale failure"));
    await Promise.resolve();
    expect(logAndNotice).not.toHaveBeenCalled();
    update();
    expect(renderMath).toHaveBeenCalledTimes(2);
  });

  it("allows retry after a current typesetting failure", async () => {
    const { update, document } = setup();
    vi.mocked(finishRenderMath).mockRejectedValueOnce(new Error("current failure"));
    update();
    await document.runTimers();
    expect(logAndNotice).toHaveBeenCalledOnce();
    update();
    expect(renderMath).toHaveBeenCalledTimes(2);
  });

  it("does no further layout work when unloaded while MathJax is finishing", async () => {
    const { plugin, update, document, host } = setup();
    let finish!: () => void;
    vi.mocked(finishRenderMath).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    update();
    await document.runTimers();
    plugin.destroy();
    host.setCssProps.mockClear();
    finish();
    await Promise.resolve();
    expect(document.frames.size).toBe(0);
    expect(host.setCssProps).not.toHaveBeenCalled();
  });
});
