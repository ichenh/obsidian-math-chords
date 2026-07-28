import { describe, expect, it, vi } from "vitest";
import {
  isTikzPrintContainer,
  trackTikzPostProcessorPromise,
} from "../../src/tikz/markdownExport";

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

  it("adds the render completion to an exporter's wait queue", () => {
    const promises: Promise<unknown>[] = [];
    const completion = Promise.resolve();

    trackTikzPostProcessorPromise({ promises }, completion);

    expect(promises).toEqual([completion]);
  });

  it("does not require a private wait queue", () => {
    expect(() => {
      trackTikzPostProcessorPromise({}, Promise.resolve());
    }).not.toThrow();
  });
});
