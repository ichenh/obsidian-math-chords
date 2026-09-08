import { beforeEach, describe, expect, it, vi } from "vitest";
import { type App, type Editor, type WorkspaceLeaf, MarkdownView } from "obsidian";
import { copyFormulaImage, exportFormulaImage, exportSingleFormula, type FormulaExportRenderer, type FormulaNativeRenderer } from "../../src/formulaExport";
import { displayFormulaAtPosition, displayFormulaInSection } from "../../src/formulaExportModel";
import { createTikzDocument } from "../../src/tikz/document";

const mocks = vi.hoisted(() => ({
  notice: vi.fn(), load: vi.fn(), finish: vi.fn(), render: vi.fn(),
  save: vi.fn(), write: vi.fn(), parse: vi.fn(), hide: vi.fn(), chtml: vi.fn(),
}));
vi.mock("obsidian", () => ({
  MarkdownView: class {}, Notice: class { hide = mocks.hide; constructor(message: string) { mocks.notice(message); } },
  loadMathJax: mocks.load, finishRenderMath: mocks.finish, renderMath: mocks.render,
}));
vi.mock("../../src/l10n/locale", () => ({ t: (key: string) => key }));
vi.mock("../../src/formulaMathJax", () => ({ snapshotMathJaxForPng: mocks.chtml }));
vi.mock("../../src/tikz/desktopNode", () => ({
  getDesktopSaveDialog: () => ({ showSaveDialog: mocks.save }),
  getDesktopFileSystem: () => ({ writeFile: mocks.write }),
}));

const SVG_NS = "http://www.w3.org/2000/svg";

class ClipboardItemFixture {
  constructor(readonly data: Record<string, Promise<Blob>>) {}
}

// This small DOM fixture models the API boundary, including adoption across windows.
// It does not implement or replace SVG rendering or XML parsing.
class ElementFixture {
  children: ElementFixture[] = [];
  parent?: ElementFixture;
  style = { cssText: "" };
  private values = new Map<string, string>();
  constructor(public ownerDocument: DocumentFixture, public localName: string, public namespaceURI = SVG_NS) {}
  createDiv(options: { cls: string }) {
    const child = this.appendChild(new ElementFixture(this.ownerDocument, "div", "html"));
    child.setAttribute("class", options.cls);
    return child;
  }
  get id(): string { return this.getAttribute("id") ?? ""; }
  get firstChild(): ElementFixture | null { return this.children[0] ?? null; }
  get attributes(): { name: string; localName: string; value: string }[] {
    return Array.from(this.values, ([name, value]) => ({ name, localName: name.replace(/^.*:/, ""), value }));
  }
  getAttribute(name: string): string | null { return this.values.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.values.set(name, value); }
  removeAttribute(name: string): void { this.values.delete(name); }
  appendChild(child: ElementFixture): ElementFixture {
    child.remove();
    child.parent = this;
    for (const node of [child, ...child.querySelectorAll("*")]) node.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }
  insertBefore(child: ElementFixture, before: ElementFixture | null): void {
    this.appendChild(child);
    if (before) { this.children.pop(); this.children.splice(this.children.indexOf(before), 0, child); }
  }
  contains(child: ElementFixture): boolean { return child === this || this.querySelectorAll("*").includes(child); }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = undefined;
  }
  cloneNode(): ElementFixture {
    const copy = new ElementFixture(this.ownerDocument, this.localName, this.namespaceURI);
    for (const attr of this.attributes) copy.setAttribute(attr.name, attr.value);
    for (const child of this.children) copy.appendChild(child.cloneNode());
    return copy;
  }
  querySelectorAll(selector: string): ElementFixture[] {
    const all = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
    return all.filter((child) => selector === "*" || (selector === "[id]" ? Boolean(child.id) : child.localName === selector));
  }
  querySelector(selector: string): ElementFixture | null { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect(): { width: number; height: number } {
    return { width: Number(this.getAttribute("width")) || 0, height: Number(this.getAttribute("height")) || 0 };
  }
}

function serialize(node: ElementFixture): string {
  return `<${node.localName}${node.attributes.map(({ name, value }) => ` ${name}="${value}"`).join("")}>${node.children.map(serialize).join("")}</${node.localName}>`;
}

class DocumentFixture {
  body = new ElementFixture(this, "body", "html");
  documentElement = this.body;
  imageFails = false;
  context = { clearRect: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn() };
  canvas = { width: 0, height: 0, getContext: () => this.context, toBlob: (callback: (blob: Blob) => void) => callback(new Blob(["PNG"], { type: "image/png" })) };
  defaultView = {
    navigator: { clipboard: { write: vi.fn(async (_items: ClipboardItemFixture[]) => {}) } },
    ClipboardItem: ClipboardItemFixture as typeof ClipboardItemFixture | undefined,
    Blob, MathJax: undefined as undefined | { tex2svgPromise: (latex: string) => Promise<HTMLElement> },
    URL: { createObjectURL: vi.fn(() => "blob:formula"), revokeObjectURL: vi.fn() },
    XMLSerializer: class { serializeToString(node: ElementFixture): string { return serialize(node); } },
    DOMParser: class { parseFromString(value: string): DocumentFixture { return mocks.parse(value) as DocumentFixture; } },
    Image: this.imageConstructor(),
  };
  private imageConstructor() {
    const shouldFail = () => this.imageFails;
    return class {
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) { queueMicrotask(() => shouldFail() ? this.onerror?.() : this.onload?.()); }
    };
  }
  createElement(name: string): ElementFixture | typeof this.canvas { return name === "canvas" ? this.canvas : new ElementFixture(this, name, "html"); }
  createDocumentFragment() { return { createEl: (name: string) => this.createElement(name) }; }
  createElementNS(namespace: string, name: string): ElementFixture { return new ElementFixture(this, name, namespace); }
  getElementById(id: string): ElementFixture | null { return this.body.querySelectorAll("[id]").find((element) => element.id === id) ?? null; }
  querySelector(selector: string): ElementFixture | null { return this.body.querySelector(selector); }
}

function rendered(document: DocumentFixture, childName = "path"): ElementFixture {
  const container = new ElementFixture(document, "mjx-container", "html");
  const svg = container.appendChild(new ElementFixture(document, "svg"));
  svg.setAttribute("viewBox", "0 0 120 40");
  svg.setAttribute("width", "120");
  svg.setAttribute("height", "40");
  const child = svg.appendChild(new ElementFixture(document, childName));
  child.setAttribute("fill", "currentColor");
  child.setAttribute("d", "M0 0L5 5");
  return container;
}

function environment(source = "$x$") {
  const document = new DocumentFixture();
  const editor = {
    getValue: vi.fn(() => source), listSelections: vi.fn(() => [{ anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } }]),
    posToOffset: (position: { ch: number }) => position.ch, transaction: vi.fn(),
  };
  const view: unknown = Object.assign(new MarkdownView({} as WorkspaceLeaf), { editor, containerEl: { ownerDocument: document } });
  const app = { workspace: { getLeavesOfType: () => [{ view }] } } as unknown as App;
  mocks.render.mockImplementation(() => rendered(document));
  document.defaultView.MathJax = { tex2svgPromise: mocks.render };
  return { document, editor, app, export: (format: "svg" | "png" = "svg", native?: FormulaNativeRenderer, renderer: FormulaExportRenderer = "mathjax") => exportSingleFormula(app, editor as unknown as Editor, format, native, renderer) };
}

function savedSvg(): string {
  return new TextDecoder().decode(mocks.write.mock.calls[0][1] as Uint8Array);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(undefined);
  mocks.write.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue({ canceled: false, filePath: "D:/formula" });
});

describe("formula image clipboard", () => {
  it("writes a PNG promise immediately to the formula window without a file dialog or note edits", async () => {
    const env = environment();
    let finish!: () => void;
    mocks.load.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const copied = copyFormulaImage("E=mc^2", true, env.document as unknown as Document);
    const write = env.document.defaultView.navigator.clipboard.write;
    expect(write).toHaveBeenCalledOnce();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.notice).not.toHaveBeenCalledWith("formulaCopyDone");
    const item = write.mock.calls[0][0][0];
    expect(Object.keys(item.data)).toEqual(["image/png"]);
    finish();
    await copied;
    expect((await item.data["image/png"]).type).toBe("image/png");
    expect(mocks.render).toHaveBeenCalledWith("E=mc^2", { display: true });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(env.editor.transaction).not.toHaveBeenCalled();
    expect(mocks.notice).toHaveBeenCalledWith("formulaCopyDone");
    expect(env.document.body.children).toHaveLength(0);
    expect(mocks.hide).toHaveBeenCalledOnce();
  });

  it("copies the host's CHTML output as transparent PNG", async () => {
    const env = environment();
    env.document.defaultView.MathJax = undefined;
    vi.stubGlobal("window", {});
    mocks.chtml.mockResolvedValue({ source: '<svg><foreignObject/></svg>', width: 40, height: 20 });
    try {
      await copyFormulaImage("x", true, env.document as unknown as Document);
      expect(mocks.chtml).toHaveBeenCalledOnce();
      expect(env.document.canvas.width).toBe(120);
      expect(env.document.canvas.height).toBe(60);
      expect(env.document.context.fillRect).not.toHaveBeenCalled();
      expect(mocks.notice).toHaveBeenCalledWith("formulaCopyDone");
    } finally { vi.unstubAllGlobals(); }
  });

  it("reports unavailable clipboard access before starting rendering", async () => {
    const env = environment();
    env.document.defaultView.ClipboardItem = undefined;
    await copyFormulaImage("x", true, env.document as unknown as Document);
    expect(mocks.notice).toHaveBeenCalledWith("formulaCopyUnavailable");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("reports clipboard rejection and cleans up even if image rendering also fails", async () => {
    const env = environment();
    env.document.defaultView.navigator.clipboard.write.mockRejectedValue(new Error("Access denied"));
    env.document.imageFails = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await copyFormulaImage("x", true, env.document as unknown as Document);
      expect(mocks.notice).toHaveBeenCalledWith("formulaCopyFailed");
      expect(mocks.notice).not.toHaveBeenCalledWith("formulaCopyDone");
      expect(mocks.hide).toHaveBeenCalledOnce();
      expect(env.document.body.children).toHaveLength(0);
    } finally { log.mockRestore(); }
  });
});

describe("single formula export", () => {
  it.each(["reported", "standard"])("preserves %s backslashes from Markdown through the native TeX document", async (variant) => {
    const reported = String.raw`\begin{aligned}
v^2&=u^2+2as\\\\
0&=(18.0)^2+2a(45.0)\\\\
a&=-3.60\ \mathrm{m\\,s^{-2}}.
\end{aligned}`;
    const latex = variant === "reported" ? reported : reported.replace(/\\\\/g, "\\");
    const source = `$$\n${latex}\n$$`;
    const expected = `\n${latex}\n`;
    expect(displayFormulaAtPosition(source, 3)).toBe(expected);
    expect(displayFormulaInSection(source, 0, source.split("\n").length - 1, 0, 1)).toBe(expected);
    const env = environment(source);
    env.editor.listSelections.mockReturnValue([{ anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } }]);
    let document = "";
    const render = vi.fn<FormulaNativeRenderer>(async (tikz) => {
      document = createTikzDocument(tikz);
      return { bytes: new Uint8Array(), mediaType: "application/pdf", backend: "native", durationMs: 0 };
    });
    await env.export("svg", render, "tex");
    const start = document.indexOf("\\begin{aligned}");
    const end = document.indexOf("\\end{aligned}", start) + "\\end{aligned}".length;
    expect(document.slice(start, end)).toBe(latex);
    expect([...document.slice(start, end).matchAll(/\\+/g)].map((match) => match[0].length))
      .toEqual([...latex.matchAll(/\\+/g)].map((match) => match[0].length));
    expect(env.editor.transaction).not.toHaveBeenCalled();
  });

  it("exports an explicit rendered-block snapshot without consulting an editor", async () => {
    const env = environment("$unrelated$");
    await exportFormulaImage("E=mc^2", true, "svg", env.document as unknown as Document);
    expect(mocks.render).toHaveBeenCalledWith("E=mc^2", { display: true });
    expect(env.editor.getValue).not.toHaveBeenCalled();
    expect(env.editor.transaction).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledOnce();
  });
  it("copies global glyph definitions from the original window, fixes color, and releases its host", async () => {
    const env = environment();
    const origin = new DocumentFixture();
    const output = rendered(origin, "use");
    output.querySelector("use")?.setAttribute("xlink:href", "#glyphA");
    const definition = origin.body.appendChild(new ElementFixture(origin, "path"));
    definition.setAttribute("id", "glyphA");
    definition.setAttribute("d", "M1 2L3 4");
    mocks.render.mockReturnValue(output);
    await env.export();
    expect(savedSvg()).toContain('<defs><path id="glyphA" d="M1 2L3 4">');
    expect(savedSvg()).toContain('fill="#000000"');
    expect(savedSvg()).not.toContain("currentColor");
    expect(mocks.write.mock.calls[0][0]).toBe("D:/formula.svg");
    expect(env.document.body.children).toHaveLength(0);
    expect(env.editor.transaction).not.toHaveBeenCalled();
  });

  it("uses native MathJax SVG when available without invoking the TeX fallback", async () => {
    const env = environment();
    const tex2svgPromise = vi.fn(async () => rendered(env.document) as unknown as HTMLElement);
    env.document.defaultView.MathJax = { tex2svgPromise };
    const fallback = vi.fn<FormulaNativeRenderer>();
    await env.export("svg", fallback);
    expect(tex2svgPromise).toHaveBeenCalledWith("x", { display: false });
    expect(mocks.render).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("uses explicitly selected local TeX with captured source and separated trailing comments", async () => {
    const env = environment("$$x % comment$$");
    env.editor.listSelections.mockReturnValue([{ anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } }]);
    mocks.render.mockReturnValue(new ElementFixture(env.document, "mjx-container"));
    const parsed = new DocumentFixture();
    parsed.documentElement = rendered(parsed).querySelector("svg")!;
    mocks.parse.mockReturnValue(parsed);
    const fallback = vi.fn<FormulaNativeRenderer>(async () => ({ bytes: new TextEncoder().encode("<real-native-svg/>"), mediaType: "image/svg+xml", backend: "native", durationMs: 1 }));
    mocks.save.mockImplementation(async () => {
      env.editor.getValue.mockReturnValue("changed");
      return { canceled: false, filePath: "D:/formula.svg" };
    });
    await env.export("svg", fallback, "tex");
    expect(fallback).toHaveBeenCalledWith("\\begin{tikzpicture}\n\\node[inner sep=0pt,outer sep=0pt,text=black] {$\\displaystyle\nx % comment\n$};\n\\end{tikzpicture}");
    expect(mocks.parse).toHaveBeenCalledWith("<real-native-svg/>");
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(env.editor.transaction).not.toHaveBeenCalled();
  });

  it.each(["svg", "png"] as const)("removes Markdown boundary blank lines before native %s compilation", async (format) => {
    const latex = String.raw`\begin{aligned}
v^2&=u^2+2as\\
0&=(18.0)^2+2a(45.0)\\
a&=-3.60\ \mathrm{m\,s^{-2}}.
\end{aligned}`;
    const env = environment(`$$\n${latex}\n$$`);
    env.editor.listSelections.mockReturnValue([{ anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } }]);
    const parsed = new DocumentFixture();
    parsed.documentElement = rendered(parsed).querySelector("svg")!;
    mocks.parse.mockReturnValue(parsed);
    const native = vi.fn<FormulaNativeRenderer>(async () => ({
      bytes: new TextEncoder().encode("<native-svg/>"), mediaType: "image/svg+xml", backend: "native", durationMs: 0,
    }));
    await env.export(format, native, "tex");
    const source = native.mock.calls[0][0];
    expect(source).toContain(`$\\displaystyle\n${latex}\n$`);
    expect(source).not.toMatch(/\n[ \t]*\n/);
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(env.editor.getValue()).toBe(`$$\n${latex}\n$$`);
  });

  it("refuses a native PDF fallback without saving fake SVG", async () => {
    const env = environment();
    mocks.render.mockReturnValue(new ElementFixture(env.document, "mjx-container"));
    await env.export("svg", async () => ({ bytes: new Uint8Array(), mediaType: "application/pdf", backend: "native", durationMs: 1 }), "tex");
    expect(mocks.notice).toHaveBeenCalledWith("formulaExportUnavailable");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("exports native MathJax CHTML as PNG without invoking local TeX", async () => {
    const env = environment();
    mocks.render.mockReturnValue(new ElementFixture(env.document, "mjx-container"));
    mocks.chtml.mockResolvedValue({ source: '<svg><foreignObject/></svg>', width: 40, height: 20 });
    const fallback = vi.fn<FormulaNativeRenderer>();
    await env.export("png", fallback);
    expect(mocks.chtml).toHaveBeenCalledWith("x", false, expect.anything());
    expect(fallback).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(env.document.canvas.width).toBe(120);
    expect(env.document.canvas.height).toBe(60);
    expect(env.document.defaultView.URL.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.hide).toHaveBeenCalledOnce();
  });

  it("does not silently invoke TeX after a MathJax error", async () => {
    const env = environment();
    mocks.render.mockReturnValue(new ElementFixture(env.document, "mjx-container"));
    mocks.chtml.mockRejectedValue(new Error("Missing native font"));
    const fallback = vi.fn<FormulaNativeRenderer>();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await env.export("png", fallback);
      expect(fallback).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.notice).toHaveBeenCalledWith("formulaExportFailed\nMissing native font");
    } finally { log.mockRestore(); }
  });

  it("reports the concrete save failure and dismisses progress", async () => {
    const env = environment();
    mocks.write.mockRejectedValue(new Error("EACCES: permission denied"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await env.export();
      expect(mocks.notice).toHaveBeenCalledWith("formulaExportFailed\nEACCES: permission denied");
      expect(log).toHaveBeenCalledWith("[Math Chords] Formula export failed", expect.any(Error));
      expect(mocks.hide).toHaveBeenCalledOnce();
      expect(env.document.body.children).toHaveLength(0);
    } finally { log.mockRestore(); }
  });

  it.each(["svg", "png"] as const)("shows the TeX syntax diagnostic for failed native %s export", async (format) => {
    const env = environment();
    const sourceLine = String.raw`l.7 ...a&=-3.60\ \mathrm{m\\,s^{-2}}`;
    const render = vi.fn<FormulaNativeRenderer>().mockRejectedValue(new Error(
      `Command failed: latex.exe -halt-on-error main.tex\nTeX startup log\n! Missing } inserted.\n<inserted text>\n}\n${sourceLine}\n`,
    ));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await env.export(format, render, "tex");
      expect(mocks.notice).toHaveBeenCalledWith(`formulaExportFailed\n! Missing } inserted.\n${sourceLine}`);
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.hide).toHaveBeenCalledOnce();
      expect(env.document.body.children).toHaveLength(0);
    } finally { log.mockRestore(); }
  });

  it.each(["foreignObject", "text", "image", "script"])("refuses font-dependent or non-vector %s output", async (name) => {
    const env = environment();
    mocks.render.mockReturnValue(rendered(env.document, name));
    await env.export();
    expect(mocks.notice).toHaveBeenCalledWith("formulaExportInvalidSvg");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["#missing", "https://example.invalid/font.svg#id"])("refuses unresolved glyph references: %s", async (href) => {
    const env = environment();
    const output = rendered(env.document, "use");
    output.querySelector("use")?.setAttribute("href", href);
    mocks.render.mockReturnValue(output);
    await env.export();
    expect(mocks.notice).toHaveBeenCalledWith("formulaExportInvalidSvg");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("renders a transparent PNG at 3x in the editor window and revokes its URL", async () => {
    const env = environment();
    await env.export("png");
    expect(env.document.canvas.width).toBe(360);
    expect(env.document.canvas.height).toBe(120);
    expect(env.document.context.clearRect).toHaveBeenCalledWith(0, 0, 360, 120);
    expect(env.document.context.drawImage).toHaveBeenCalledOnce();
    expect(env.document.context.fillRect).not.toHaveBeenCalled();
    expect(env.document.defaultView.URL.revokeObjectURL).toHaveBeenCalledWith("blob:formula");
    expect(mocks.write.mock.calls[0][0]).toBe("D:/formula.png");
  });

  it("releases image URLs and hosts when rasterization fails", async () => {
    const env = environment();
    env.document.imageFails = true;
    await env.export("png");
    expect(env.document.defaultView.URL.revokeObjectURL).toHaveBeenCalledWith("blob:formula");
    expect(env.document.body.children).toHaveLength(0);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects oversized output before allocating a canvas", async () => {
    const env = environment();
    const output = rendered(env.document);
    output.querySelector("svg")?.setAttribute("width", "10000");
    mocks.render.mockReturnValue(output);
    await env.export("png");
    expect(mocks.notice).toHaveBeenCalledWith("formulaExportTooLarge");
    expect(env.document.defaultView.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("does no rendering when the save dialog is canceled", async () => {
    const env = environment();
    mocks.save.mockResolvedValue({ canceled: true });
    await env.export();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects multiple editor selections before showing a save dialog", async () => {
    const env = environment();
    const selection = { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } };
    env.editor.listSelections.mockReturnValue([selection, selection]);
    await env.export();
    expect(mocks.notice).toHaveBeenCalledWith("formulaExportSingleSelection");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
