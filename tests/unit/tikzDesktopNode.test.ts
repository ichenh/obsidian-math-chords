import { describe, expect, it, vi } from "vitest";
import {
  getDesktopChildProcess,
  getDesktopFileSystem,
  getDesktopPath,
  getDesktopProcess,
  getDesktopSaveDialog,
  getDesktopTempDirectory,
} from "../../src/tikz/desktopNode";

function desktopWindow(modules: Readonly<Record<string, unknown>>): Window {
  return {
    require(specifier: string): unknown {
      if (!(specifier in modules)) throw new Error(`Missing ${specifier}`);
      return modules[specifier];
    },
  } as unknown as Window;
}

describe("desktop runtime capability adapters", () => {
  it("accepts complete reviewed filesystem and process capabilities", () => {
    const fileSystem = {
      access: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdtemp: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
      rm: vi.fn(),
    };
    const host = desktopWindow({
      "node:fs/promises": fileSystem,
      "node:process": { platform: "win32", env: { PATH: "C:\\TeX\\bin" } },
      "node:os": { tmpdir: () => "C:\\Temp" },
    });

    expect(getDesktopFileSystem(host)).toBe(fileSystem);
    expect(getDesktopProcess(host).platform).toBe("win32");
    expect(getDesktopTempDirectory(host)).toBe("C:\\Temp");
  });

  it("rejects incomplete filesystem capabilities", () => {
    const host = desktopWindow({
      "node:fs/promises": { access: vi.fn() },
    });
    expect(() => getDesktopFileSystem(host)).toThrow(
      "desktop filesystem module is unavailable",
    );
  });

  it("validates the complete path and child-process capabilities", () => {
    const pathModule = {
      delimiter: ";",
      basename: vi.fn(),
      dirname: vi.fn(),
      extname: vi.fn(),
      isAbsolute: vi.fn(),
      join: vi.fn(),
      relative: vi.fn(),
      resolve: vi.fn(),
    };
    const childProcess = { execFile: vi.fn() };
    const host = desktopWindow({
      "node:path": pathModule,
      "node:child_process": childProcess,
    });

    expect(getDesktopPath(host)).toBe(pathModule);
    expect(getDesktopChildProcess(host)).toBe(childProcess);
  });

  it("rejects incomplete process-launch capabilities", () => {
    const host = desktopWindow({
      "node:child_process": {},
    });
    expect(() => getDesktopChildProcess(host)).toThrow(
      "desktop process launcher is unavailable",
    );
  });

  it("uses the reviewed Electron dialog fallback without exposing the module", async () => {
    const showSaveDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: "diagram.svg",
    });
    const host = desktopWindow({
      electron: { remote: { dialog: { showSaveDialog } } },
    });

    const dialog = getDesktopSaveDialog(host);
    await expect(dialog?.showSaveDialog({})).resolves.toEqual({
      canceled: false,
      filePath: "diagram.svg",
    });
  });
});
