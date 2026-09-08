import { describe, expect, it, vi } from "vitest";
import { renderMath } from "obsidian";
import { inlineMathJaxFontUrls, snapshotMathJaxForPng } from "../../src/formulaMathJax";

vi.mock("obsidian", () => ({ finishRenderMath: vi.fn(), renderMath: vi.fn() }));

// A serialization boundary fixture; actual MathJax layout is owned by Obsidian.
class SnapshotNode {
  attributes = new Map<string, string>();
  children: SnapshotNode[] = [];
  textContent = "";
  constructor(readonly localName: string, readonly ownerDocument: unknown) {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  append(...nodes: SnapshotNode[]) { this.children.push(...nodes); }
  appendChild(node: SnapshotNode) { this.append(node); return node; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 161, height: 64 }; }
  cloneNode() {
    const copy = new SnapshotNode(this.localName, this.ownerDocument);
    copy.attributes = new Map(this.attributes);
    return copy;
  }
}

describe("multiline MathJax PNG layout", () => {
  it("overrides native display margins outside the measured box for the reported aligned formula", async () => {
    const nativeRule = 'mjx-container[jax="CHTML"][display="true"] { display:block; margin:1em 0; text-align:center; }';
    const document = {
      defaultView: {
        getComputedStyle: () => ({ fontFamily: "serif" }),
        XMLSerializer: class {
          serializeToString(node: SnapshotNode): string {
            return `<${node.localName}${[...node.attributes].map(([k, v]) => ` ${k}="${v}"`).join("")}>${node.textContent}${node.children.map((child) => this.serializeToString(child)).join("")}</${node.localName}>`;
          }
        },
      },
      getElementById: () => ({ baseURI: "app://obsidian.md/index.html", sheet: { cssRules: [{ cssText: nativeRule }] } }),
      fonts: { load: vi.fn() },
      createElementNS: (_namespace: string, tag: string): SnapshotNode => new SnapshotNode(tag, document),
    };
    const rendered = new SnapshotNode("mjx-container", document);
    rendered.setAttribute("jax", "CHTML");
    rendered.setAttribute("display", "true");
    vi.mocked(renderMath).mockReturnValue(rendered as unknown as HTMLElement);
    const host = new SnapshotNode("div", document);
    const latex = String.raw`\begin{aligned} v^2&=u^2+2as\\\ 0&=(18.0)^2+2a(45.0)\\\ a&=-3.60\ \mathrm{m\\,s^{-2}}. \end{aligned}`;
    const snapshot = await snapshotMathJaxForPng(latex, true, host as unknown as HTMLElement);
    expect(renderMath).toHaveBeenLastCalledWith(latex, true);
    expect(snapshot.width).toBe(165);
    expect(snapshot.height).toBe(68);
    // The extra parent class makes this more specific than the native display rule.
    // A bare mjx-container[jax="CHTML"] rule loses and shifts the final row off-canvas.
    const override = '.math-chords-export-snapshot > mjx-container[jax="CHTML"][display="true"] { margin:0; text-align:left; }';
    expect(snapshot.source).toContain(override);
    expect(snapshot.source.indexOf(override)).toBeGreaterThan(snapshot.source.indexOf(nativeRule));
    expect(snapshot.source).toContain('<div class="math-chords-export-snapshot">');
    expect(snapshot.source).toContain('<mjx-container jax="CHTML" display="true">');
    expect(rendered.attributes.has("style")).toBe(false);
    expect(host.children).toEqual([rendered]);
  });
});

describe("self-contained MathJax PNG fonts", () => {
  const base = "app://obsidian.md/index.html";
  const font = "/lib/mathjax/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff";

  it("embeds the host font once even when referenced repeatedly", async () => {
    const read = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer);
    const css = `@font-face{src:url('${font}')} .copy{src:url("${font}")}`;
    const embedded = await inlineMathJaxFontUrls(css, base, read);
    expect(read).toHaveBeenCalledExactlyOnceWith(`app://obsidian.md${font}`);
    expect(embedded.match(/data:font\/woff;base64,AQID/g)).toHaveLength(2);
    expect(embedded).not.toContain("app://");
  });

  it.each(["https://example.com/font.woff", "file:///C:/private/font.woff", "/other/font.woff", "/lib/mathjax/../../other/font.woff"])(
    "rejects non-MathJax resources without requesting them: %s", async (url) => {
      const read = vi.fn();
      await expect(inlineMathJaxFontUrls(`src:url('${url}')`, base, read)).rejects.toThrow("embedded Obsidian font");
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("reports missing fonts and rejects empty data instead of exporting missing glyphs", async () => {
    await expect(inlineMathJaxFontUrls(`src:url('${font}')`, base, async () => { throw new Error("font missing"); })).rejects.toThrow("font missing");
    await expect(inlineMathJaxFontUrls(`src:url('${font}')`, base, async () => new ArrayBuffer(0))).rejects.toThrow("Invalid MathJax font");
  });
});
