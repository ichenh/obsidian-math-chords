import { afterEach, describe, expect, it, vi } from "vitest";
import { TikzBlockExportControls } from "../../src/tikz/blockExport";
import { exportTikzPreview, type TikzExportRequest } from "../../src/tikz/exportPreview";

const notice = vi.hoisted(() => vi.fn());
vi.mock("obsidian", () => ({
  Notice: class { constructor(message: string) { notice(message); } },
  setIcon: vi.fn(),
}));
vi.mock("../../src/tikz/exportPreview", () => ({ exportTikzPreview: vi.fn() }));

// Model toolbar ownership and event boundaries, not Obsidian's visual layout.
class ElementFixture {
  nodeType = 1;
  className = "";
  type = "";
  disabled = false;
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
  get nextElementSibling(): ElementFixture | null {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  appendChild(child: ElementFixture) {
    child.remove(); child.parentElement = this; this.children.push(child); return child;
  }
  insertBefore(child: ElementFixture, reference: ElementFixture) {
    child.remove(); child.parentElement = this; this.children.splice(this.children.indexOf(reference), 0, child);
  }
  createDiv(options: { cls: string }) {
    const child = this.appendChild(this.ownerDocument.createElement());
    child.className = options.cls;
    return child;
  }
  createEl() { return this.appendChild(this.ownerDocument.createElement()); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  contains(child: ElementFixture): boolean { return child === this || this.children.some((node) => node.contains(child)); }
  matches(selector: string): boolean {
    return selector.split(",").some((part) => this.classList.contains(part.trim().slice(1)));
  }
  closest(selector: string): ElementFixture | null {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
  }
  querySelector(selector: string): ElementFixture | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, callback: (event: Event) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
  }
  fire(name: string) {
    const event = new Event(name, { cancelable: true });
    const stop = vi.spyOn(event, "stopPropagation");
    this.listeners.get(name)?.forEach((listener) => listener(event));
    return { event, stop };
  }
  asElement() { return this as unknown as HTMLElement; }
}

class DocumentFixture {
  notify = (_records: MutationRecord[] = []) => {};
  disconnect = vi.fn();
  observe = vi.fn();
  defaultView = { MutationObserver: this.observerClass() };
  private observerClass() {
    const { disconnect, observe } = this;
    const register = (callback: (records: MutationRecord[]) => void) => {
      this.notify = (records = []) => callback(records);
    };
    return class {
      disconnect = disconnect;
      observe = observe;
      constructor(callback: (records: MutationRecord[]) => void) { register(callback); }
    };
  }
  createElement() { return new ElementFixture(this); }
  createDocumentFragment() { return new ElementFixture(this); }
}

const active: TikzBlockExportControls[] = [];
function mutation(target: ElementFixture, added: ElementFixture[] = [], removed: ElementFixture[] = []): MutationRecord[] {
  return [{ target, addedNodes: added, removedNodes: removed }] as unknown as MutationRecord[];
}
afterEach(() => {
  for (const controls of active.splice(0)) controls.destroy();
  vi.resetAllMocks();
});

function setup(mode: "native" | "legacy" | "reading" = "native") {
  const document = new DocumentFixture();
  const host = document.createElement();
  const toolbar = mode === "native" ? host.createDiv({ cls: "embed-actions" }) : host;
  const edit = document.createElement();
  edit.className = "edit-block-button";
  if (mode !== "reading") toolbar.appendChild(edit);
  const snapshot = {
    artifact: { bytes: new Uint8Array([1]), mediaType: "image/svg+xml", backend: "wasm", durationMs: 1 },
    outputEl: document.createElement().asElement(),
  } satisfies TikzExportRequest;
  const getData = vi.fn((): TikzExportRequest | null => snapshot);
  const controls = new TikzBlockExportControls(host.asElement(), getData);
  active.push(controls);
  const button = host.querySelector(".obsidian-math-chords-tikz-block-export")!;
  return { document, host, toolbar, edit, controls, button, snapshot, getData };
}

describe("TikZ block downloads", () => {
  it("ignores SVG and icon updates but restores a removed download button", () => {
    const { document, host, toolbar, button, edit } = setup();
    const preview = host.createDiv({ cls: "obsidian-math-chords-tikz-preview" });
    const svg = preview.createDiv({ cls: "test-svg" });
    const scan = vi.spyOn(host, "querySelector");
    document.notify(mutation(preview, [svg]));
    document.notify(mutation(host, [preview]));
    document.notify(mutation(button, [button.ownerDocument.createElement()]));
    expect(scan).not.toHaveBeenCalled();
    button.remove();
    document.notify(mutation(toolbar, [], [button]));
    expect(scan).toHaveBeenCalledOnce();
    expect(toolbar.children).toEqual([button, edit]);
  });

  it("places download immediately before the native edit action and cleans up only its own controls", () => {
    const { document, host, toolbar, edit, controls, button } = setup();
    expect(toolbar.children).toEqual([button, edit]);
    expect(button.attributes.get("aria-label")).toBe("Export diagram");
    expect(document.observe).toHaveBeenCalledWith(host, { childList: true, subtree: true });
    const insert = vi.spyOn(toolbar, "insertBefore");
    document.notify();
    expect(insert).not.toHaveBeenCalled();
    controls.destroy();
    expect(toolbar.children).toEqual([edit]);
    expect(document.disconnect).toHaveBeenCalledOnce();
  });

  it.each(["legacy", "reading"] as const)("uses a separate corner toolbar in %s markup", (mode) => {
    const { host, button, controls, edit } = setup(mode);
    const toolbar = host.querySelector(".obsidian-math-chords-tikz-block-actions")!;
    expect(toolbar.children).toEqual([button]);
    expect(toolbar.classList.contains("has-edit-button")).toBe(mode === "legacy");
    controls.destroy();
    expect(host.children).toEqual(mode === "legacy" ? [edit] : []);
  });

  it("moves the existing button when Obsidian adds or replaces its toolbar later", () => {
    const { document, host, edit, button } = setup("reading");
    let native = host.createDiv({ cls: "embed-actions" });
    native.appendChild(edit);
    document.notify(mutation(host, [native]));
    expect(native.children).toEqual([button, edit]);
    expect(host.querySelector(".obsidian-math-chords-tikz-block-actions")).toBeNull();
    native.remove();
    native = host.createDiv({ cls: "embed-actions" });
    native.appendChild(edit);
    document.notify(mutation(host, [native]));
    expect(native.children).toEqual([button, edit]);
  });

  it("exports the clicked diagram without activating source editing or opening duplicate save dialogs", async () => {
    const { button, snapshot, getData } = setup();
    const other = setup();
    let finish!: () => void;
    vi.mocked(exportTikzPreview).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    for (const name of ["pointerdown", "mousedown", "dblclick", "click"]) {
      const { event, stop } = button.fire(name);
      expect(event.defaultPrevented).toBe(true);
      expect(stop).toHaveBeenCalledOnce();
    }
    expect(exportTikzPreview).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(other.getData).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    getData.mockReturnValueOnce(other.snapshot);
    button.fire("click");
    expect(exportTikzPreview).toHaveBeenCalledOnce();
    const key = button.fire("keydown");
    expect(key.stop).toHaveBeenCalledOnce();
    expect(key.event.defaultPrevented).toBe(false);
    finish();
    await Promise.resolve();
    expect(button.disabled).toBe(false);
  });

  it("reports export errors and allows retry, but ignores missing data and unloaded controls", async () => {
    const { button, controls, getData } = setup();
    getData.mockReturnValueOnce(null);
    button.fire("click");
    expect(exportTikzPreview).not.toHaveBeenCalled();
    vi.mocked(exportTikzPreview).mockRejectedValueOnce(new Error("Disk is full"));
    button.fire("click");
    await Promise.resolve();
    expect(notice).toHaveBeenCalledWith("Disk is full");
    expect(button.disabled).toBe(false);
    controls.destroy();
    button.fire("click");
    expect(exportTikzPreview).toHaveBeenCalledOnce();
  });
});
