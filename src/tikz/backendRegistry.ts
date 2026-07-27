import { moment, Platform } from "obsidian";
import type { ObsidianMathChordsSettings } from "../settings";
import { NativeLatexBackend } from "./backends/nativeLatexBackend";
import { ChordTikzWasmBackend } from "./backends/chordTikzWasmBackend";
import {
  AutomaticTikzBackend,
  selectAutomaticTikzBackend,
} from "./backends/automaticTikzBackend";
import {
  nativeEngineKindFromFilename,
  nativeEnginePreference,
  type NativeTikzEngine,
  type NativeTikzEngineKind,
} from "./nativeEngine";
import type {
  TikzRenderBackend,
  TikzRenderRequest,
} from "./types";
import { tikzFontPreferencesFromSettings } from "./fonts";

export interface TikzBackendRegistryOptions {
  getSettings: () => ObsidianMathChordsSettings;
}

export interface TikzBackendDiagnostics {
  builtInAvailable: boolean;
  desktop: boolean;
  configuredNativePath: string;
  nativeEngines: NativeTikzEngine[];
}

export class TikzBackendRegistry {
  private wasmBackend: ChordTikzWasmBackend | null = null;
  private readonly nativeBackends = new Map<
    NativeTikzEngineKind,
    NativeLatexBackend
  >();
  private nativeEngines: Promise<NativeTikzEngine[]> | null = null;

  constructor(private readonly options: TikzBackendRegistryOptions) {}

  async select(request: TikzRenderRequest): Promise<TikzRenderBackend> {
    if (request.backend === "wasm") return this.requireWasm();
    if (request.backend === "native") return this.requireNative(request.source);
    const automatic = await selectAutomaticTikzBackend(request.source, {
      getWasm: () => this.getWasm(),
      getNative: (source) => this.getNative(source),
    });
    if (automatic) {
      return automatic.id === "wasm"
        ? new AutomaticTikzBackend(automatic, () =>
            this.getNative(request.source),
          )
        : automatic;
    }
    throw new Error(
      "Neither the built-in WASM renderer nor a compatible local TeX engine is available.",
    );
  }

  dispose(): void {
    this.wasmBackend?.dispose();
    for (const backend of this.nativeBackends.values()) backend.dispose();
    this.wasmBackend = null;
    this.nativeBackends.clear();
    this.nativeEngines = null;
  }

  async diagnose(): Promise<TikzBackendDiagnostics> {
    const settings = this.options.getSettings();
    const [builtInAvailable, nativeEngines] = await Promise.all([
      this.getWasm().then((backend) => backend !== null),
      Platform.isDesktop
        ? (this.nativeEngines ??= discoverNativeTikzEngines(
            settings.tikzNativeEnginePath,
          ))
        : Promise.resolve([]),
    ]);
    return {
      builtInAvailable,
      desktop: Platform.isDesktop,
      configuredNativePath: settings.tikzNativeEnginePath,
      nativeEngines,
    };
  }

  private async getWasm(): Promise<ChordTikzWasmBackend | null> {
    this.wasmBackend ??= new ChordTikzWasmBackend();
    return (await this.wasmBackend.isAvailable()) ? this.wasmBackend : null;
  }

  private async requireWasm(): Promise<ChordTikzWasmBackend> {
    const backend = await this.getWasm();
    if (!backend) {
      throw new Error(
        "The Chord TikZ WASM core is unavailable. Reinstall the complete plugin package or choose local TeX.",
      );
    }
    return backend;
  }

  private async requireNative(source: string): Promise<NativeLatexBackend> {
    const backend = await this.getNative(source);
    if (!backend || !(await backend.isAvailable())) {
      throw new Error(
        "No compatible local LuaLaTeX, XeLaTeX, pdfLaTeX, LaTeX + dvisvgm, or Tectonic engine was found. Set an executable or distribution directory in TikZ settings.",
      );
    }
    return backend;
  }

  private async getNative(source: string): Promise<NativeLatexBackend | null> {
    if (!Platform.isDesktop) return null;
    this.nativeEngines ??= discoverNativeTikzEngines(
      this.options.getSettings().tikzNativeEnginePath,
    );
    const engines = await this.nativeEngines;
    for (const kind of nativeEnginePreference(source)) {
      const engine = engines.find((candidate) => candidate.kind === kind);
      if (!engine) continue;
      let backend = this.nativeBackends.get(kind);
      if (!backend) {
        backend = new NativeLatexBackend({
          engine,
          getFonts: () =>
            tikzFontPreferencesFromSettings(this.options.getSettings()),
          getLocale: () => moment.locale(),
        });
        this.nativeBackends.set(kind, backend);
      }
      if (await backend.isAvailable()) return backend;
    }
    return null;
  }
}

async function discoverNativeTikzEngines(
  configuredPath: string,
): Promise<NativeTikzEngine[]> {
  if (!Platform.isDesktop) return [];
  const fs = require("node:fs/promises") as typeof import("node:fs/promises");
  const path = require("node:path") as typeof import("node:path");
  const nodeProcess = require("node:process") as typeof import("node:process");
  const executableSuffix = nodeProcess.platform === "win32" ? ".exe" : "";
  const directories: string[] = [];
  const explicitEngines: NativeTikzEngine[] = [];
  if (configuredPath) {
    try {
      const configuredStat = await fs.stat(configuredPath);
      if (configuredStat.isDirectory()) {
        directories.push(configuredPath);
      } else {
        const kind = nativeEngineKindFromFilename(path.basename(configuredPath));
        if (kind) {
          explicitEngines.push({
            kind,
            executablePath: configuredPath,
          });
        }
        directories.push(path.dirname(configuredPath));
      }
    } catch {
      directories.push(
        path.extname(configuredPath)
          ? path.dirname(configuredPath)
          : configuredPath,
      );
    }
  }

  for (const entry of (nodeProcess.env.PATH ?? "").split(path.delimiter)) {
    if (entry.trim()) directories.push(entry.trim());
  }

  if (nodeProcess.platform === "win32") {
    for (const root of ["C:\\texlive", "D:\\texlive"]) {
      try {
        const versions = await fs.readdir(root);
        versions.sort().reverse();
        for (const version of versions) {
          directories.push(path.join(root, version, "bin", "windows"));
        }
      } catch {
        // A TeX Live root is optional.
      }
    }
  } else {
    directories.push("/Library/TeX/texbin", "/usr/local/bin", "/usr/bin");
  }

  const uniqueDirectories = [...new Set(directories)];
  const dvisvgmPath = await findExecutable(
    fs,
    path,
    uniqueDirectories,
    `dvisvgm${executableSuffix}`,
  );
  const discovered: NativeTikzEngine[] = [...explicitEngines];
  const executableKinds: Array<
    [Exclude<NativeTikzEngineKind, "latex-dvi">, string]
  > = [
    ["lualatex", `lualatex${executableSuffix}`],
    ["xelatex", `xelatex${executableSuffix}`],
    ["pdflatex", `pdflatex${executableSuffix}`],
    ["tectonic", `tectonic${executableSuffix}`],
  ];
  for (const [kind, filename] of executableKinds) {
    if (discovered.some((engine) => engine.kind === kind)) continue;
    const executablePath = await findExecutable(
      fs,
      path,
      uniqueDirectories,
      filename,
    );
    if (executablePath) discovered.push({ kind, executablePath });
  }

  if (!discovered.some((engine) => engine.kind === "latex-dvi")) {
    const latexPath = await findExecutable(
      fs,
      path,
      uniqueDirectories,
      `latex${executableSuffix}`,
    );
    if (latexPath && dvisvgmPath) {
      discovered.push({
        kind: "latex-dvi",
        executablePath: latexPath,
        dvisvgmPath,
      });
    }
  }
  const explicitDvi = discovered.find((engine) => engine.kind === "latex-dvi");
  if (explicitDvi && !explicitDvi.dvisvgmPath) {
    explicitDvi.dvisvgmPath = dvisvgmPath ?? undefined;
  }
  return discovered;
}

async function findExecutable(
  fs: typeof import("node:fs/promises"),
  path: typeof import("node:path"),
  directories: readonly string[],
  filename: string,
): Promise<string | null> {
  for (const directory of directories) {
    const candidate = path.join(directory, filename);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next explicitly bounded directory.
    }
  }
  return null;
}
