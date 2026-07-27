import { Platform } from "obsidian";
import { createTikzDocument } from "../document";
import {
  type NativeTikzEngine,
} from "../nativeEngine";
import type { TikzRenderArtifact, TikzRenderBackend } from "../types";
import type { TikzFontPreferences } from "../fonts";

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

  constructor(private readonly options: NativeLatexBackendOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async isAvailable(): Promise<boolean> {
    if (!Platform.isDesktop) return false;
    const fs = require("node:fs/promises") as typeof import("node:fs/promises");
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
    const fs = require("node:fs/promises") as typeof import("node:fs/promises");
    const os = require("node:os") as typeof import("node:os");
    const path = require("node:path") as typeof import("node:path");
    const startedAt = performance.now();
    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-chords-tikz-"),
    );
    const cacheDir = path.join(os.tmpdir(), "math-chords-tex-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const resolvedTemp = path.resolve(os.tmpdir());
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
        return await readPdfArtifact(
          fs,
          path.join(workDir, "main.pdf"),
          startedAt,
          result,
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
        return await readPdfArtifact(
          fs,
          path.join(workDir, "main.pdf"),
          startedAt,
          latexResult,
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
  fs: typeof import("node:fs/promises"),
  pdfPath: string,
  startedAt: number,
  result: ProcessResult,
): Promise<TikzRenderArtifact> {
  const pdf = await readBoundedFile(fs, pdfPath);
  return {
    bytes: new Uint8Array(pdf),
    mediaType: "application/pdf",
    backend: "native",
    durationMs: performance.now() - startedAt,
    log: compactLog(result),
  };
}

async function readBoundedFile(
  fs: typeof import("node:fs/promises"),
  filePath: string,
): Promise<Buffer> {
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
  const childProcess = require("node:child_process") as typeof import("node:child_process");
  const nodeProcess = require("node:process") as typeof import("node:process");
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
