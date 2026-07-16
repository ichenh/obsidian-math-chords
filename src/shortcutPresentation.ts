import type { MathEnvironment, Shortcut } from "./types";

export interface ShortcutPreview {
  latex: string | null;
  fallback: string | null;
}

export function shortcutMatchesSearch(entry: Shortcut, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;

  return [entry.keys, entry.command, entry.name ?? "", entry.group ?? ""]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function buildShortcutPreview(command: string): ShortcutPreview {
  const trimmed = command.trim();
  if (!trimmed) return { latex: null, fallback: null };
  if (trimmed === "__DISPLAY_MATH__") return { latex: null, fallback: "$$" };
  if (trimmed === "\\frac{$$}{}") return { latex: "\\frac{x}{y}", fallback: null };
  if (trimmed === "'") return { latex: "x'", fallback: null };
  if (trimmed === "\\,") return { latex: "x\\,x", fallback: null };

  let latex = trimmed.replace(/\$\$/gu, (_marker, offset: number) => {
    const prefix = trimmed.slice(0, offset);
    // TeX control words consume following letters. Group the sample so
    // `\langle$$` does not become the undefined command `\langlex`.
    return /\\[a-zA-Z]+$/u.test(prefix) ? "{x}" : "x";
  });
  if (/^[\^_]/u.test(latex)) latex = `x${latex}`;
  return { latex, fallback: null };
}

export function buildMathEnvironmentPreview(environment: MathEnvironment): string {
  const environmentName =
    environment.begin.match(/^\\begin\{([^}]+)\}$/u)?.[1].toLocaleLowerCase() ??
    environment.name.toLocaleLowerCase();
  if (environmentName === "cases") {
    return `${environment.begin}x, & x > 0 \\\\ 0, & x = 0${environment.end}`;
  }
  if (["matrix", "pmatrix", "bmatrix", "vmatrix", "vmatrix*"].includes(environmentName)) {
    return `${environment.begin}a & b \\\\ c & d${environment.end}`;
  }
  if (environmentName === "aligned" || environmentName === "align") {
    return `${environment.begin}a &= b \\\\ c &= d${environment.end}`;
  }
  if (environmentName === "gathered" || environmentName === "gather") {
    return `${environment.begin}a + b \\\\ c + d${environment.end}`;
  }
  return `${environment.begin}x${environment.end}`;
}
