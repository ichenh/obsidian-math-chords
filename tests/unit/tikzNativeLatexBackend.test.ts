import { beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import type { DesktopChildProcess, DesktopPath } from "../../src/tikz/desktopNode";
import { EMPTY_TIKZ_FONT_PREFERENCES } from "../../src/tikz/fonts";
import { NativeLatexBackend } from "../../src/tikz/backends/nativeLatexBackend";

let path: DesktopPath | undefined;
if (Platform.isDesktop) path = (await import("node:path")).win32;

const mocks = vi.hoisted(() => ({
  execFile: vi.fn<DesktopChildProcess["execFile"]>(),
  access: vi.fn(async () => undefined),
  readFile: vi.fn<(file: string) => Promise<Uint8Array>>(),
  rm: vi.fn(async () => undefined),
}));

vi.mock("obsidian", () => ({ Platform: { isDesktop: true } }));
vi.mock("../../src/tikz/desktopNode", () => ({
  getDesktopPath: () => path,
  getDesktopTempDirectory: () => "C:\\Temp",
  getDesktopProcess: () => ({ platform: "win32", env: {} }),
  getDesktopChildProcess: () => ({ execFile: mocks.execFile }),
  getDesktopFileSystem: () => ({
    access: mocks.access, readFile: mocks.readFile, rm: mocks.rm,
    mkdtemp: async () => "C:\\Temp\\math-chords-tikz-sample",
    mkdir: async () => undefined, writeFile: async () => undefined,
    stat: async () => ({ size: 100, isFile: () => true }),
  }),
}));

describe("native PDF vector fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(undefined);
  });

  it.each(["missing", "failed"])("preserves the PDF when pdftocairo is %s", async (failure) => {
    const pdf = new TextEncoder().encode("%PDF-original");
    mocks.readFile.mockResolvedValue(pdf);
    if (failure === "missing") mocks.access.mockRejectedValue(new Error("ENOENT"));
    mocks.execFile.mockImplementation((executable, _args, _options, callback) => {
      callback(executable.endsWith("xelatex.exe") ? null : new Error("Conversion failed"), "", "");
    });
    const backend = new NativeLatexBackend({
      engine: { kind: "xelatex", executablePath: "C:\\texlive\\bin\\xelatex.exe", dvisvgmPath: "C:\\texlive\\bin\\dvisvgm.exe" },
      getFonts: () => EMPTY_TIKZ_FONT_PREFERENCES, getLocale: () => "en",
    });

    const artifact = await backend.render(String.raw`\node {$x$};`);

    expect(artifact.mediaType).toBe("application/pdf");
    expect(artifact.bytes).toEqual(pdf);
    expect(mocks.execFile).toHaveBeenCalledTimes(failure === "missing" ? 2 : 3);
    expect(mocks.rm).toHaveBeenCalledOnce();
  });

  it("returns actual SVG and preserves PDF when dvisvgm fails but sibling pdftocairo succeeds", async () => {
    const pdf = new TextEncoder().encode("%PDF-original");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="30pt" height="24pt" viewBox="0 0 30 24"><path d="M0 0L1 1"/></svg>');
    mocks.readFile.mockImplementation(async (file) => file.endsWith(".svg") ? svg : pdf);
    mocks.execFile.mockImplementation((executable, _args, _options, callback) => {
      if (executable.endsWith("dvisvgm.exe")) callback(new Error("Ghostscript is not supported"), "", "");
      else callback(null, "", "");
    });
    const backend = new NativeLatexBackend({
      engine: { kind: "xelatex", executablePath: "C:\\texlive\\bin\\xelatex.exe", dvisvgmPath: "C:\\texlive\\bin\\dvisvgm.exe" },
      getFonts: () => EMPTY_TIKZ_FONT_PREFERENCES, getLocale: () => "en",
    });

    const artifact = await backend.render(String.raw`\node {$\frac{1}{2}mv^2$};`);

    expect(artifact.mediaType).toBe("image/svg+xml");
    expect(artifact.bytes).toEqual(svg);
    expect(artifact.exportPdfBytes).toEqual(pdf);
    expect(mocks.execFile.mock.calls.map(([executable]) => path?.basename(executable))).toEqual([
      "xelatex.exe", "dvisvgm.exe", "pdftocairo.exe",
    ]);
    expect(mocks.execFile.mock.calls[2][1]).toEqual([
      "-svg", "C:\\Temp\\math-chords-tikz-sample\\main.pdf", "C:\\Temp\\math-chords-tikz-sample\\main.svg",
    ]);
    expect(mocks.access).toHaveBeenCalledWith("C:\\texlive\\bin\\pdftocairo.exe");
    expect(mocks.rm).toHaveBeenCalledOnce();
  });
});
