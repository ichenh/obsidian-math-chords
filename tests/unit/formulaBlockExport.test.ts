import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "obsidian";
import { FormulaBlockExportControls, registerFormulaBlockExport } from "../../src/formulaBlockExport";

const mocks = vi.hoisted(() => ({ notice: vi.fn() }));
vi.mock("@codemirror/view", () => ({ ViewPlugin: { define: (factory: unknown) => factory } }));
vi.mock("../../src/l10n/locale", () => ({ t: (key: string) => key }));
vi.mock("obsidian", () => ({
  Notice: class { constructor(message: string) { mocks.notice(message); } },
  setIcon: vi.fn(),
  Menu: class {
    items: { title: string; click: () => void }[] = [];
    onClose?: () => void;
    constructor() { menus.push(this); }
    addItem(callback: (item: unknown) => void) {
      const value = { title: "", click: () => {},
        setTitle(title: string) { this.title = title; return this; },
        setIcon() { return this; },
        onClick(click: () => void) { this.click = click; return this; },
      };
      callback(value); this.items.push(value); return this;
    }
    onHide(callback: () => void) { this.onClose = callback; }
    hide() { this.onClose?.(); }
    showAtPosition = vi.fn();
  },
  MarkdownRenderChild: class {
    cleanups: (() => void)[] = [];
    register(cleanup: () => void) { this.cleanups.push(cleanup); }
  },
}));

interface TestMenu {
  items: { title: string; click: () => void }[];
  showAtPosition: ReturnType<typeof vi.fn>;
  hide(): void;
}
const menus: TestMenu[] = [];

// This fixture checks DOM ownership, ordering and event boundaries, not host layout/rendering.
class ElementFixture {
  nodeType = 1;
  className = "";
  type = "";
  children: ElementFixture[] = [];
  parentElement: ElementFixture | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: Event) => void)[]>();
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
    add: (name: string) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
    remove: (name: string) => { this.className = this.className.split(" ").filter((part) => part !== name).join(" "); },
    toggle: (name: string, enabled: boolean) => enabled ? this.classList.add(name) : this.classList.remove(name),
  };
  constructor(readonly ownerDocument: DocumentFixture) {}
  appendChild(child: ElementFixture) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
  insertBefore(child: ElementFixture, reference: ElementFixture) {
    child.remove(); child.parentElement = this; this.children.splice(this.children.indexOf(reference), 0, child);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  contains(child: ElementFixture): boolean { return child === this || this.children.some((node) => node.contains(child)); }
  matches(selector: string): boolean {
    return selector.split(",").some((part) => part.trim().split(".").filter(Boolean).every((name) => this.classList.contains(name)));
  }
  closest(selector: string): ElementFixture | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector: string): ElementFixture[] {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string): ElementFixture | null { return this.querySelectorAll(selector)[0] ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, callback: (event: Event) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]); }
  getBoundingClientRect() { return { left: 30, bottom: 50 }; }
  fire(name: string) {
    const event = new Event(name, { cancelable: true });
    const stop = vi.spyOn(event, "stopPropagation");
    this.listeners.get(name)?.forEach((listener) => listener(event));
    return { event, stop };
  }
  asElement() { return this as unknown as HTMLElement; }
}

class DocumentFixture {
  observer?: { notify: (records: MutationRecord[]) => void; disconnect: ReturnType<typeof vi.fn> };
  defaultView = { MutationObserver: this.observerClass() };
  private observerClass() {
    const register = (observer: DocumentFixture["observer"]) => { this.observer = observer; };
    return class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(readonly notify: (records: MutationRecord[]) => void) { register(this); }
    };
  }
  createElement() { return new ElementFixture(this); }
}

function mutation(target: ElementFixture, added: ElementFixture[] = [], removed: ElementFixture[] = []): MutationRecord[] {
  return [{ target, addedNodes: added, removedNodes: removed }] as unknown as MutationRecord[];
}

function setup() {
  const document = new DocumentFixture();
  const root = document.createElement();
  const block = root.appendChild(document.createElement());
  block.className = "math math-block cm-embed-block";
  const toolbar = block.appendChild(document.createElement());
  toolbar.className = "embed-actions";
  const edit = toolbar.appendChild(document.createElement());
  edit.className = "edit-block-button";
  return { document, root, block, toolbar, edit };
}

beforeEach(() => { menus.length = 0; vi.clearAllMocks(); });

describe("formula block export controls", () => {
  it("adds and removes actions immediately when the setting changes", () => {
    const env = setup();
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => "x", vi.fn(), true, vi.fn(), false);
    expect(env.toolbar.children).toEqual([env.edit]);
    controls.setEnabled(true);
    expect(env.toolbar.children).toHaveLength(3);
    const button = env.toolbar.children[1];
    button.fire("click");
    controls.setEnabled(false);
    expect(button.attributes.get("aria-expanded")).toBe("false");
    expect(env.toolbar.children).toEqual([env.edit]);
    controls.setEnabled(true);
    expect(env.toolbar.children).toHaveLength(3);
    controls.destroy();
  });

  it("skips editor-wide scans for ordinary typing and its own action mutations", () => {
    const env = setup();
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => "x", vi.fn(), true, vi.fn());
    const scan = vi.spyOn(env.root, "querySelectorAll");
    const paragraph = env.root.appendChild(env.document.createElement());
    const word = paragraph.appendChild(env.document.createElement());
    env.document.observer?.notify(mutation(paragraph, [word]));
    env.document.observer?.notify(mutation(env.toolbar, [...env.toolbar.children]));
    expect(scan).not.toHaveBeenCalled();
    env.block.remove();
    env.document.observer?.notify(mutation(env.root, [], [env.block]));
    expect(scan).toHaveBeenCalledOnce();
    expect(env.toolbar.children).toEqual([env.edit]);
    controls.destroy();
  });

  it("attaches controls when a formula enters the viewport", () => {
    const env = setup();
    env.block.remove();
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => "x", vi.fn(), true, vi.fn());
    env.root.appendChild(env.block);
    env.document.observer?.notify(mutation(env.root, [env.block]));
    expect(env.toolbar.children).toHaveLength(3);
    controls.destroy();
  });

  it("copies the clicked block before download and edit without opening a menu", () => {
    const env = setup();
    const copied = vi.fn();
    const exported = vi.fn();
    let latex = "first";
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => latex, exported, true, copied);
    const copy = env.toolbar.children[0];
    expect(copy.attributes.get("aria-label")).toBe("formulaCopyTitle");
    expect(copy.attributes.get("title")).toBe("formulaCopyButtonDesc");
    expect(env.toolbar.children[1].attributes.get("title")).toBe("formulaExportButtonDesc");
    expect(env.toolbar.children[1].attributes.get("aria-label")).toBe("formulaExportTitle");
    expect(env.toolbar.children[2]).toBe(env.edit);
    latex = "current formula";
    for (const name of ["pointerdown", "mousedown", "dblclick", "click"]) {
      const { event, stop } = copy.fire(name);
      expect(event.defaultPrevented).toBe(true);
      expect(stop).toHaveBeenCalledOnce();
    }
    expect(copied).toHaveBeenCalledExactlyOnceWith("current formula", env.document);
    expect(exported).not.toHaveBeenCalled();
    expect(menus).toHaveLength(0);
    copy.remove();
    env.document.observer?.notify(mutation(env.block, [], [copy]));
    expect(env.toolbar.children).toHaveLength(3);
    controls.destroy();
    expect(env.toolbar.children).toEqual([env.edit]);
  });

  it("inserts before the native edit action and isolates pointer and click events", () => {
    const env = setup();
    const exported = vi.fn();
    let latex = "first";
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => latex, exported, true, vi.fn());
    const button = env.toolbar.children[1];
    expect(env.toolbar.children[2]).toBe(env.edit);
    for (const eventName of ["pointerdown", "mousedown", "dblclick", "click"]) {
      const { event, stop } = button.fire(eventName);
      expect(event.defaultPrevented).toBe(true);
      expect(stop).toHaveBeenCalledOnce();
    }
    expect(menus[0].items.map((item) => item.title)).toEqual(["cmdExportFormulaPng", "cmdExportFormulaSvg", "formulaExportPngTex"]);
    expect(menus[0].showAtPosition).toHaveBeenCalledWith({ x: 30, y: 50 }, env.document);
    latex = "changed after menu opened";
    menus[0].items[0].click();
    expect(exported).toHaveBeenCalledWith("first", "png", env.document, "mathjax");
    menus[0].items[1].click();
    expect(exported).toHaveBeenLastCalledWith("first", "svg", env.document, "tex");
    controls.destroy();
    expect(env.toolbar.children).toEqual([env.edit]);
    expect(env.document.observer?.disconnect).toHaveBeenCalledOnce();
  });

  it("handles delayed MathJax replacement without duplicates and cleans up reading controls", () => {
    const env = setup();
    env.toolbar.remove();
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => "x", vi.fn(), false, vi.fn());
    const original = env.block.children[0];
    env.document.observer?.notify(mutation(env.block, [original]));
    expect(env.block.children).toEqual([original]);
    original.remove();
    env.document.observer?.notify(mutation(env.block, [], [original]));
    expect(env.block.children).toHaveLength(1);
    expect(env.block.children[0]).not.toBe(original);
    controls.destroy();
    expect(env.block.children).toHaveLength(0);
    expect(env.block.classList.contains("obsidian-math-chords-formula-block")).toBe(false);
  });

  it("does not attach live controls to inline math or show a menu for ambiguous source", () => {
    const env = setup();
    const inline = env.root.appendChild(env.document.createElement());
    inline.className = "math math-inline";
    const controls = new FormulaBlockExportControls(env.root.asElement(), () => null, vi.fn(), true, vi.fn());
    expect(inline.children).toHaveLength(0);
    env.toolbar.children[1].fire("click");
    expect(menus).toHaveLength(0);
    expect(mocks.notice).toHaveBeenCalledWith("formulaExportNoFormula");
    controls.destroy();
  });

  it("registers a live view adapter that resolves the clicked block without moving the selection", () => {
    const env = setup();
    const plugin = { register: vi.fn(), registerEditorExtension: vi.fn(), registerMarkdownPostProcessor: vi.fn() };
    const exported = vi.fn();
    registerFormulaBlockExport(plugin as unknown as Plugin, exported, vi.fn());
    const source = "$$first$$\n$$second$$";
    const view = {
      contentDOM: env.root.asElement(), state: { doc: { toString: () => source } },
      posAtDOM: vi.fn(() => source.indexOf("$$second")), dispatch: vi.fn(),
    };
    const createView = plugin.registerEditorExtension.mock.calls[0][0] as (value: typeof view) => { destroy: () => void };
    const instance = createView(view);
    env.toolbar.children[1].fire("click");
    menus[0].items[0].click();
    expect(view.posAtDOM).toHaveBeenCalledWith(env.block);
    expect(exported).toHaveBeenCalledWith("second", "png", env.document, "mathjax");
    expect(view.dispatch).not.toHaveBeenCalled();
    instance.destroy();
    expect(env.toolbar.children).toEqual([env.edit]);
  });

  it("reads the current section in Reading view and removes controls when the plugin unloads", () => {
    const env = setup();
    env.toolbar.remove();
    env.block.className = "math math-block";
    const plugin = { register: vi.fn(), registerEditorExtension: vi.fn(), registerMarkdownPostProcessor: vi.fn() };
    const exported = vi.fn();
    registerFormulaBlockExport(plugin as unknown as Plugin, exported, vi.fn());
    const context = {
      getSectionInfo: vi.fn(() => ({ text: "$$other$$\n$$target$$", lineStart: 1, lineEnd: 1 })),
      addChild: (child: { onload: () => void }) => child.onload(),
    };
    const process = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as (root: HTMLElement, context: unknown) => void;
    process(env.root.asElement(), context);
    const button = env.block.children[0].children[1];
    button.fire("click");
    menus[0].items[0].click();
    expect(context.getSectionInfo).toHaveBeenCalledWith(env.block);
    expect(exported).toHaveBeenCalledWith("target", "png", env.document, "mathjax");
    const unload = plugin.register.mock.calls[0][0] as () => void;
    unload();
    expect(env.block.children).toHaveLength(0);
    expect(env.document.observer?.disconnect).toHaveBeenCalledOnce();
  });
});
