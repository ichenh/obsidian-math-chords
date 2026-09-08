import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { createTikzLivePreviewExtension } from "../../src/tikz/livePreviewExtension";
import type { TikzRenderCoordinator } from "../../src/tikz/coordinator";
import { EMPTY_TIKZ_FONT_PREFERENCES } from "../../src/tikz/fonts";

const surface = vi.hoisted(() => ({
  render: vi.fn(),
  refresh: vi.fn(),
  suspend: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@codemirror/view", () => ({
  ViewPlugin: { fromClass: (plugin: unknown) => plugin },
}));
vi.mock("obsidian", () => ({
  Notice: vi.fn(),
  Platform: { isDesktop: true },
  setIcon: vi.fn(),
}));
vi.mock("../../src/tikz/exportPreview", () => ({ exportTikzPreview: vi.fn() }));
vi.mock("../../src/tikz/previewSurface", () => ({
  TikzPreviewSurface: class {
    readonly containerEl: HTMLElement;
    render = surface.render;
    refresh = surface.refresh;
    suspend = surface.suspend;
    destroy = surface.destroy;

    constructor(document: Document) {
      this.containerEl = document.body.createDiv();
    }
  },
}));

// Model only panel ownership and the document pointer listener. Parsing uses
// real CodeMirror documents; renderer behavior has separate surface tests.
class TestElement {
  children: TestElement[] = [];
  hidden = false;
  isConnected = true;
  style = {};
  classList = { contains: () => false };
  addEventListener = vi.fn();
  setAttribute = vi.fn();
  addClass = vi.fn();
  remove = vi.fn();

  constructor(readonly ownerDocument: TestDocument) {}

  createDiv(): TestElement {
    const child = new TestElement(this.ownerDocument);
    this.appendChild(child);
    return child;
  }

  createEl(): TestElement {
    return this.createDiv();
  }

  appendChild(child: TestElement): void {
    this.children.push(child);
  }

  contains(target: TestElement): boolean {
    return this === target || this.children.some((child) => child.contains(target));
  }
}

class TestDocument {
  body = new TestElement(this);
  defaultView = {
    Node: TestElement,
    innerWidth: 1200,
    requestAnimationFrame: (callback: () => void) => callback(),
  };
  querySelector = vi.fn(() => null);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

interface TestPlugin {
  update(update: ViewUpdate): void;
  destroy(): void;
}

const plugins: TestPlugin[] = [];
afterEach(() => {
  for (const plugin of plugins.splice(0)) plugin.destroy();
  vi.clearAllMocks();
});

function setup() {
  const source = "```tikz\n\\begin{tikzpicture}\n\\draw (0,0)--(1,1);\n\\end{tikzpicture}\n```\nAfter\n";
  const document = new TestDocument();
  const dom = document.body.createDiv();
  const view = {
    dom,
    contentDOM: dom.createDiv(),
    state: EditorState.create({
      doc: source,
      selection: { anchor: source.indexOf("draw") },
    }),
    hasFocus: true,
    dispatch: vi.fn((spec: TransactionSpec) => {
      view.state = view.state.update(spec).state;
    }),
  };
  const settings = { enabled: true, language: "tikz" };
  const Plugin = createTikzLivePreviewExtension({
    coordinator: {} as TikzRenderCoordinator,
    isEnabled: () => settings.enabled,
    getLanguage: () => settings.language,
    getBackend: () => "wasm",
    getFonts: () => EMPTY_TIKZ_FONT_PREFERENCES,
    getLocale: () => "en",
  }) as unknown as new (view: EditorView) => TestPlugin;
  const plugin = new Plugin(view as unknown as EditorView);
  plugins.push(plugin);
  const panel = document.body.children[1];
  const update = (changes: Partial<ViewUpdate> = {}) => plugin.update({
    view,
    docChanged: false,
    selectionSet: false,
    focusChanged: false,
    geometryChanged: false,
    ...changes,
  } as unknown as ViewUpdate);
  const pointerDown = (target: TestElement) => {
    const listener = document.addEventListener.mock.calls.find(
      ([name]) => name === "pointerdown",
    )?.[1] as (event: { target: TestElement }) => void;
    listener({ target });
  };
  surface.render.mockClear();
  document.querySelector.mockClear();
  return { document, view, settings, panel, update, pointerDown };
}

describe("TikZ live preview updates", () => {
  it("skips unrelated rendering and layout while retaining settings refresh", () => {
    const { document, panel, update } = setup();
    expect(panel.hidden).toBe(false);

    update();

    expect(surface.render).not.toHaveBeenCalled();
    expect(document.querySelector).not.toHaveBeenCalled();
    expect(surface.refresh).toHaveBeenCalledOnce();

    update({ geometryChanged: true });

    expect(document.querySelector).toHaveBeenCalledOnce();
    expect(surface.render).not.toHaveBeenCalled();
    expect(surface.refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps an externally closed panel hidden on blur and restores a selection", () => {
    const { document, view, panel, update, pointerDown } = setup();
    pointerDown(document.body.createDiv());
    expect(panel.hidden).toBe(true);
    expect(surface.suspend).toHaveBeenCalledOnce();

    view.hasFocus = false;
    update({ focusChanged: true, geometryChanged: true });

    expect(panel.hidden).toBe(true);
    expect(surface.render).not.toHaveBeenCalled();
    expect(document.querySelector).not.toHaveBeenCalled();

    view.hasFocus = true;
    update({ selectionSet: true });

    expect(panel.hidden).toBe(false);
    expect(surface.render).toHaveBeenCalledOnce();
  });

  it.each(["disabled", "outside block", "language changed"] as const)(
    "suspends the preview when %s",
    (reason) => {
      const { view, settings, panel, update } = setup();
      if (reason === "disabled") settings.enabled = false;
      if (reason === "language changed") settings.language = "other-tikz";
      if (reason === "outside block") {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
      }

      update({ selectionSet: reason === "outside block" });

      expect(panel.hidden).toBe(true);
      expect(surface.suspend).toHaveBeenCalledOnce();
      expect(surface.render).not.toHaveBeenCalled();
    },
  );

  it("moves the caret out of the block and suspends after a gutter click", () => {
    const { view, panel, pointerDown, update } = setup();

    pointerDown(view.dom);
    expect(view.dispatch).toHaveBeenCalledOnce();
    update({ selectionSet: true });

    expect(panel.hidden).toBe(true);
    expect(surface.suspend).toHaveBeenCalledOnce();
    expect(surface.render).not.toHaveBeenCalled();
  });
});
