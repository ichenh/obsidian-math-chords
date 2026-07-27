interface DesktopSaveDialog {
  showSaveDialog(options: unknown): Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
}

interface DesktopNodeModules {
  "@electron/remote": { dialog?: DesktopSaveDialog };
  electron: { remote?: { dialog?: DesktopSaveDialog } };
  "node:child_process": typeof import("node:child_process");
  "node:fs/promises": typeof import("node:fs/promises");
  "node:os": typeof import("node:os");
  "node:path": typeof import("node:path");
  "node:process": typeof import("node:process");
}

type DesktopRequire = (specifier: string) => unknown;

function hasDesktopRequire(value: unknown): value is { require: DesktopRequire } {
  return (
    typeof value === "object" &&
    value !== null &&
    "require" in value &&
    typeof value.require === "function"
  );
}

/**
 * Loads a reviewed Node.js module through Obsidian's desktop CommonJS runtime.
 * Browser-facing TikZ modules must not call this bridge.
 */
export function loadDesktopNodeModule<
  Specifier extends keyof DesktopNodeModules,
>(
  specifier: Specifier,
  hostWindow: Window | null = window,
): DesktopNodeModules[Specifier] {
  const desktopWindow: unknown = hostWindow;
  if (!hasDesktopRequire(desktopWindow)) {
    throw new Error("The desktop Node.js runtime is unavailable.");
  }
  const loaded = desktopWindow.require(specifier);
  if (
    loaded === null ||
    (typeof loaded !== "object" && typeof loaded !== "function")
  ) {
    throw new Error(`Could not load the desktop module ${specifier}.`);
  }
  return loaded as DesktopNodeModules[Specifier];
}
