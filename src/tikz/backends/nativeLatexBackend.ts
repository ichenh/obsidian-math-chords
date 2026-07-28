import { Platform } from "obsidian";
import {
  getDesktopChildProcess,
  getDesktopFileSystem,
  getDesktopPath,
  getDesktopProcess,
  getDesktopTempDirectory,
  type DesktopFileSystem,
} from "../desktopNode";
import { createTikzDocument } from "../document";
import {
  type NativeTikzEngine,
} from "../nativeEngine";
import type { TikzRenderArtifact, TikzRenderBackend } from "../types";
import type { TikzFontPreferences } from "../fonts";
import { pdfToSvgArguments } from "../nativeVector";

export interface NativeLatexBackendOptions {
  engine: NativeTikzEngine;
  timeoutMs?: number;
  getFonts: () => TikzFontPreferences;
  getLocale: () => string;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
}

const MAX_NATIVE_SOURCE_BYTES = 256 * 1024;
const MAX_NATIVE_ARTIFACT_BYTES = 16 * 1024 * 1024;

export class NativeLatexBackend implements TikzRenderBackend {
  readonly id = "native";
  private readonly timeoutMs: number;
  private pdfToSvgAvailable = true;
  private pdfToSvgFailure: string | undefined;

  constructor(private readonly options: NativeLatexBackendOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async isAvailable(): Promise<boolean> {
    if (!Platform.isDesktop) return false;
    const fs = getDesktopFileSystem();
    try {
      await fs.access(this.options.engine.executablePath);
      if (this.options.engine.kind === "latex-dvi") {
        if (!this.options.engine.dvisvgmPath) return false;
        await fs.access(this.options.engine.dvisvgmPath);
      }
      return true;
    } catch {
      return false;
    }
  }

  async render(
    source: string,
    signal?: AbortSignal,
  ): Promise<TikzRenderArtifact> {
    if (!Platform.isDesktop) {
      throw new Error("The native LaTeX backend is available on desktop only.");
    }
    if (new TextEncoder().encode(source).byteLength > MAX_NATIVE_SOURCE_BYTES) {
      throw new Error("The TikZ source exceeds the 256 KiB native-render limit.");
    }
    const fs = getDesktopFileSystem();
    const tempDirectory = getDesktopTempDirectory();
    const path = getDesktopPath();
    const startedAt = performance.now();
    const workDir = await fs.mkdtemp(
      path.join(tempDirectory, "math-chords-tikz-"),
    );
    const cacheDir = path.join(tempDirectory, "math-chords-tex-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const resolvedTemp = path.resolve(tempDirectory);
    const resolvedWorkDir = path.resolve(workDir);

    const relativeWorkDir = path.relative(resolvedTemp, resolvedWorkDir);
    if (
      relativeWorkDir === "" ||
      relativeWorkDir.startsWith("..") ||
      path.isAbsolute(relativeWorkDir)
    ) {
      throw new Error("Refusing to use a TikZ working directory outside the system temp folder.");
    }

    try {
      const texPath = path.join(workDir, "main.tex");
      await fs.writeFile(
        texPath,
        createTikzDocument(source, {
          unicodeEngine: documentUnicodeEngine(this.options.engine.kind),
          fonts: this.options.getFonts(),
          locale: this.options.getLocale(),
        }),
        "utf8",
      );

      if (this.options.engine.kind === "tectonic") {
        const result = await runProcess(
          this.options.engine.executablePath,
          [
            "--untrusted",
            "--keep-logs",
            "--outdir",
            workDir,
            texPath,
          ],
          workDir,
          this.timeoutMs,
          signal,
          cacheDir,
        );
        return await readBestPdfArtifact(
          fs,
          path.join(workDir, "main.pdf"),
          path.join(workDir, "main.svg"),
          this.pdfToSvgAvailable
            ? this.options.engine.dvisvgmPath
            : undefined,
          workDir,
          this.timeoutMs,
          signal,
          cacheDir,
          startedAt,
          result,
          this.pdfToSvgFailure,
          (reason) => {
            this.pdfToSvgAvailable = false;
            this.pdfToSvgFailure = reason;
          },
        );
      }

      const latexResult = await runProcess(
        this.options.engine.executablePath,
        commonLatexArguments(workDir, texPath),
        workDir,
        this.timeoutMs,
        signal,
        cacheDir,
      );

      if (this.options.engine.kind !== "latex-dvi") {
        return await readBestPdfArtifact(
          fs,
          path.join(workDir, "main.pdf"),
          path.join(workDir, "main.svg"),
          this.pdfToSvgAvailable
            ? this.options.engine.dvisvgmPath
            : undefined,
          workDir,
          this.timeoutMs,
          signal,
          cacheDir,
          startedAt,
          latexResult,
          this.pdfToSvgFailure,
          (reason) => {
            this.pdfToSvgAvailable = false;
            this.pdfToSvgFailure = reason;
          },
        );
      }

      const dvisvgmPath = this.options.engine.dvisvgmPath;
      if (!dvisvgmPath) {
        throw new Error("The selected DVI engine requires dvisvgm.");
      }
      const dviPath = path.join(workDir, "main.dvi");
      const svgPath = path.join(workDir, "main.svg");
      const svgResult = await runProcess(
        dvisvgmPath,
        [
          "--no-fonts",
          "--exact-bbox",
          "--bbox=min",
          `--output=${svgPath}`,
          dviPath,
        ],
        workDir,
        this.timeoutMs,
        signal,
        cacheDir,
      );
      const svg = await readBoundedFile(fs, svgPath);

      return {
        bytes: new Uint8Array(svg),
        mediaType: "image/svg+xml",
        backend: "native",
        durationMs: performance.now() - startedAt,
        log: compactLog(latexResult, svgResult),
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  dispose(): void {}
}

function documentUnicodeEngine(
  kind: NativeTikzEngine["kind"],
): "lua" | "xe" | undefined {
  if (kind === "lualatex") return "lua";
  if (kind === "xelatex" || kind === "tectonic") return "xe";
  return undefined;
}

function commonLatexArguments(workDir: string, texPath: string): string[] {
  return [
    "-no-shell-escape",
    "-interaction=nonstopmode",
    "-halt-on-error",
    `-output-directory=${workDir}`,
    texPath,
  ];
}

async function readPdfArtifact(
  fs: DesktopFileSystem,
  pdfPath: string,
  startedAt: number,
  result: ProcessResult,
  vectorFallbackReason?: string,
): Promise<TikzRenderArtifact> {
  const pdf = await readBoundedFile(fs, pdfPath);
  return {
    bytes: new Uint8Array(pdf),
    mediaType: "application/pdf",
    backend: "native",
    durationMs: performance.now() - startedAt,
    log: appendLog(
      compactLog(result),
      vectorFallbackReason
        ? `dvisvgm PDF-to-SVG conversion was disabled after a failure; using the bounded PDF fallback. ${vectorFallbackReason}`
        : undefined,
    ),
  };
}

async function readBestPdfArtifact(
  fs: DesktopFileSystem,
  pdfPath: string,
  svgPath: string,
  dvisvgmPath: string | undefined,
  workDir: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  cacheDir: string,
  startedAt: number,
  latexResult: ProcessResult,
  vectorFallbackReason: string | undefined,
  onVectorFailure: (reason: string) => void,
): Promise<TikzRenderArtifact> {
  if (dvisvgmPath) {
    try {
      const svgResult = await runProcess(
        dvisvgmPath,
        pdfToSvgArguments(pdfPath, svgPath),
        workDir,
        timeoutMs,
        signal,
        cacheDir,
      );
      const svg = await readBoundedFile(fs, svgPath);
      const pdf = await readBoundedFile(fs, pdfPath);
      return {
        bytes: new Uint8Array(svg),
        exportPdfBytes: new Uint8Array(pdf),
        mediaType: "image/svg+xml",
        backend: "native",
        durationMs: performance.now() - startedAt,
        log: compactLog(latexResult, svgResult),
      };
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      const reason = compactFailure(error);
      onVectorFailure(reason);
      return readPdfArtifact(
        fs,
        pdfPath,
        startedAt,
        latexResult,
        reason,
      );
    }
  }
  return readPdfArtifact(
    fs,
    pdfPath,
    startedAt,
    latexResult,
    vectorFallbackReason,
  );
}

async function readBoundedFile(
  fs: DesktopFileSystem,
  filePath: string,
): Promise<Uint8Array> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error("The native TeX engine did not produce a render artifact.");
  }
  if (stat.size > MAX_NATIVE_ARTIFACT_BYTES) {
    throw new Error("The native TeX render artifact exceeds the 16 MiB safety limit.");
  }
  return fs.readFile(filePath);
}

async function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
  cacheDir: string = cwd,
): Promise<ProcessResult> {
  if (!Platform.isDesktop) {
    throw new Error("Native process execution is available on desktop only.");
  }
  const childProcess = getDesktopChildProcess();
  const nodeProcess = getDesktopProcess();
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      executable,
      args,
      {
        cwd,
        timeout: timeoutMs,
        signal,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: {
          ...nodeProcess.env,
          // Luaotfload reads Unicode data from the TeX distribution through
          // absolute paths. Restricted mode permits those files while still
          // rejecting unsafe parent-directory and hidden-file input paths.
          openin_any: "r",
          openout_any: "p",
          TEXMFCACHE: cacheDir,
          TEXMFVAR: cacheDir,
          TEXMFOUTPUT: cwd,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = [stderr, stdout]
            .map((value) => value.trim())
            .filter(Boolean)
            .join("\n");
          reject(
            new Error(
              details
                ? `${error.message}\n${details.slice(-4_000)}`
                : error.message,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function compactLog(...results: ProcessResult[]): string | undefined {
  const text = results
    .flatMap((result) => [result.stderr, result.stdout])
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
  return text ? text.slice(-8_000) : undefined;
}

function compactFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 1_000);
}

function appendLog(
  first: string | undefined,
  second: string | undefined,
): string | undefined {
  const text = [first, second].filter(Boolean).join("\n");
  return text || undefined;
}
