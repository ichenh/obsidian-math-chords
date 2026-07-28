import { describe, expect, it, vi } from "vitest";
import { isTikzPrintContainer } from "../../src/tikz/markdownExport";

describe("TikZ Markdown export integration", () => {
  it("renders immediately only inside a print document", () => {
    const printContainer = {
      closest: vi.fn((selector: string) => selector === ".print" ? {} : null),
    };
    const readingContainer = {
      closest: vi.fn(() => null),
    };

    expect(isTikzPrintContainer(printContainer)).toBe(true);
    expect(isTikzPrintContainer(readingContainer)).toBe(false);
    expect(printContainer.closest).toHaveBeenCalledWith(".print");
  });
});
