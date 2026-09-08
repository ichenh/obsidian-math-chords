import { finishRenderMath, renderMath } from "obsidian";

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Embed only the host's local MathJax fonts; no renderer or font is downloaded. */
export async function inlineMathJaxFontUrls(
  css: string, baseUrl: string, read: (url: string) => Promise<ArrayBuffer>,
): Promise<string> {
  const matches = [...css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)];
  const embedded = new Map<string, string>();
  for (const match of matches) {
    if (embedded.has(match[1])) continue;
    const url = new URL(match[1], baseUrl);
    if (url.protocol !== "app:" || url.hostname !== "obsidian.md" ||
        !url.pathname.startsWith("/lib/mathjax/") || !/\.woff2?$/.test(url.pathname)) {
      throw new Error("The MathJax font is not an embedded Obsidian font.");
    }
    const bytes = new Uint8Array(await read(url.href));
    if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("Invalid MathJax font data.");
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    embedded.set(match[1], `url("data:font/woff;base64,${btoa(binary)}")`);
  }
  return css.replace(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g, (_match, url: string) => embedded.get(url) ?? "");
}

/** A self-contained CHTML snapshot used only as an intermediate for transparent PNG. */
export async function snapshotMathJaxForPng(
  latex: string, display: boolean, host: HTMLElement,
): Promise<{ source: string; width: number; height: number }> {
  const rendered = renderMath(latex, display);
  const originalDocument = rendered.ownerDocument;
  // Keep measurement in MathJax's own document so popouts do not need copied UI styles.
  if (host.ownerDocument !== originalDocument) originalDocument.body.appendChild(host);
  host.appendChild(rendered);
  await finishRenderMath();
  if (rendered.querySelector("mjx-merror")) throw new Error("MathJax could not render this formula.");
  const document = host.ownerDocument;
  const win = document.defaultView;
  if (!win) throw new Error("The formula window is unavailable.");
  const stylesheet = originalDocument.getElementById("MJX-CHTML-styles") as HTMLStyleElement | null;
  if (!stylesheet?.sheet) throw new Error("The native MathJax stylesheet is unavailable.");
  const rules = Array.from(stylesheet.sheet.cssRules);
  const families = new Set<string>();
  for (const element of [rendered, ...Array.from(rendered.querySelectorAll("*"))]) {
    for (const pseudo of [null, "::before", "::after"]) {
      for (const family of win.getComputedStyle(element, pseudo).fontFamily.split(",")) {
        families.add(family.trim().replace(/["']/g, ""));
      }
    }
  }
  const css = rules.filter((rule) => {
    if (!rule.cssText.trimStart().startsWith("@font-face")) return true;
    const font = (rule as CSSFontFaceRule).style.getPropertyValue("font-family").replace(/["']/g, "").trim();
    return families.has(font);
  }).map((rule) => rule.cssText).join("\n");
  const embeddedCss = await inlineMathJaxFontUrls(css, stylesheet.baseURI, async (url) => {
    const response = await win.fetch(url);
    if (!response.ok) throw new Error(`Could not read the built-in MathJax font (${response.status}).`);
    return response.arrayBuffer();
  });
  await Promise.all([...families].filter((family) => family.startsWith("MJX"))
    .map((family) => document.fonts.load(`16px "${family}"`)));
  const bounds = rendered.getBoundingClientRect();
  if (!bounds.width || !bounds.height) throw new Error("MathJax produced an empty formula.");
  const width = Math.ceil(bounds.width) + 4;
  const height = Math.ceil(bounds.height) + 4;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const foreign = document.createElementNS(SVG_NS, "foreignObject");
  foreign.setAttribute("width", String(width));
  foreign.setAttribute("height", String(height));
  const wrapper = document.createElementNS(XHTML_NS, "div");
  wrapper.setAttribute("class", "math-chords-export-snapshot");
  const style = document.createElementNS(XHTML_NS, "style");
  // This stylesheet belongs to the exported image, not to the Obsidian interface.
  // The measured border box excludes margins. Match the native display selector's
  // specificity as well as the inline selector, or its 1em margins clip aligned rows.
  style.textContent = `${embeddedCss}\n.math-chords-export-snapshot { padding:2px; display:inline-block; color:black; background:transparent; font-size:16px; visibility:visible; }\n.math-chords-export-snapshot > mjx-container[jax="CHTML"],\n.math-chords-export-snapshot > mjx-container[jax="CHTML"][display="true"] { margin:0; text-align:left; }`;
  wrapper.append(style, rendered.cloneNode(true));
  foreign.appendChild(wrapper);
  svg.appendChild(foreign);
  const Serializer = win.XMLSerializer;
  return { source: new Serializer().serializeToString(svg), width, height };
}
