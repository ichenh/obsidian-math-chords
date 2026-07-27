export interface DesktopFileStat {
  readonly size: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface DesktopFileSystem {
  access(path: string): Promise<void>;
  stat(path: string): Promise<DesktopFileStat>;
  readdir(path: string): Promise<string[]>;
  mkdtemp(prefix: string): Promise<string>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(
    path: string,
    data: string | Uint8Array,
    encoding?: "utf8",
  ): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  rm(
    path: string,
    options: { recursive: true; force: true },
  ): Promise<void>;
}

export interface DesktopPath {
  readonly delimiter: string;
  basename(path: string): string;
  dirname(path: string): string;
  extname(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  resolve(path: string): string;
}

export interface DesktopProcess {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
}

export interface DesktopChildProcess {
  execFile(
    executable: string,
    args: readonly string[],
    options: {
      cwd: string;
      timeout: number;
      signal?: AbortSignal;
      windowsHide: boolean;
      maxBuffer: number;
      env: Readonly<Record<string, string | undefined>>;
    },
    callback: (
      error: Error | null,
      stdout: string,
      stderr: string,
    ) => void,
  ): void;
}

export interface DesktopSaveDialog {
  showSaveDialog(options: unknown): Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
}

type DesktopRequire = (specifier: string) => unknown;
type UnknownRecord = Record<string, unknown>;
type UnknownFunctionRecord = Record<string, (...args: never[]) => unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function hasDesktopRequire(value: unknown): value is { require: DesktopRequire } {
  return (
    isRecord(value) &&
    "require" in value &&
    typeof value.require === "function"
  );
}

function requireDesktopModule(
  specifier: string,
  hostWindow: Window | null = window,
): unknown {
  if (!hasDesktopRequire(hostWindow)) {
    throw new Error("The desktop Node.js runtime is unavailable.");
  }
  return hostWindow.require(specifier);
}

function hasFunctions(
  value: unknown,
  names: readonly string[],
): value is UnknownRecord & UnknownFunctionRecord {
  return (
    isRecord(value) &&
    names.every((name) => typeof value[name] === "function")
  );
}

export function getDesktopFileSystem(
  hostWindow?: Window | null,
): DesktopFileSystem {
  const loaded = requireDesktopModule("node:fs/promises", hostWindow);
  if (
    !hasFunctions(loaded, [
      "access",
      "stat",
      "readdir",
      "mkdtemp",
      "mkdir",
      "writeFile",
      "readFile",
      "rm",
    ])
  ) {
    throw new Error("The desktop filesystem module is unavailable.");
  }
  return loaded as unknown as DesktopFileSystem;
}

export function getDesktopPath(hostWindow?: Window | null): DesktopPath {
  const loaded = requireDesktopModule("node:path", hostWindow);
  if (
    !hasFunctions(loaded, [
      "basename",
      "dirname",
      "extname",
      "isAbsolute",
      "join",
      "relative",
      "resolve",
    ]) ||
    typeof loaded.delimiter !== "string"
  ) {
    throw new Error("The desktop path module is unavailable.");
  }
  return loaded as unknown as DesktopPath;
}

export function getDesktopProcess(hostWindow?: Window | null): DesktopProcess {
  const loaded = requireDesktopModule("node:process", hostWindow);
  if (
    !isRecord(loaded) ||
    typeof loaded.platform !== "string" ||
    !isRecord(loaded.env)
  ) {
    throw new Error("The desktop process metadata is unavailable.");
  }
  return loaded as unknown as DesktopProcess;
}

export function getDesktopTempDirectory(
  hostWindow?: Window | null,
): string {
  const loaded = requireDesktopModule("node:os", hostWindow);
  if (!hasFunctions(loaded, ["tmpdir"])) {
    throw new Error("The desktop temporary directory is unavailable.");
  }
  const tempDirectory = loaded.tmpdir();
  if (typeof tempDirectory !== "string" || !tempDirectory) {
    throw new Error("The desktop temporary directory is invalid.");
  }
  return tempDirectory;
}

export function getDesktopChildProcess(
  hostWindow?: Window | null,
): DesktopChildProcess {
  const loaded = requireDesktopModule("node:child_process", hostWindow);
  if (!hasFunctions(loaded, ["execFile"])) {
    throw new Error("The desktop process launcher is unavailable.");
  }
  return loaded as unknown as DesktopChildProcess;
}

export function getDesktopSaveDialog(
  hostWindow?: Window | null,
): DesktopSaveDialog | null {
  for (const specifier of ["@electron/remote", "electron"]) {
    try {
      const loaded = requireDesktopModule(specifier, hostWindow);
      if (!isRecord(loaded)) continue;
      const remote = specifier === "electron" ? loaded.remote : loaded;
      if (!isRecord(remote) || !isRecord(remote.dialog)) continue;
      if (typeof remote.dialog.showSaveDialog !== "function") continue;
      return remote.dialog as unknown as DesktopSaveDialog;
    } catch {
      // Try the next reviewed Electron dialog entry point.
    }
  }
  return null;
}
