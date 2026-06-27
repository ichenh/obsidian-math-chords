import { describe, expect, it } from "vitest";
import {
  extractMathContent,
  findMathRegionAt,
  hasUnclosedDisplayMath,
  hasUnclosedInlineMathBefore,
  isInMath,
  resolveSnippetInsertPosition,
  shouldAutoWrapSnippet,
} from "./math";

describe("findMathRegionAt", () => {
  it("detects inline math regions", () => {
    const doc = "text $x+y$ tail";
    const region = findMathRegionAt(doc, 7);
    expect(region).toEqual({ from: 5, to: 10, kind: "inline" });
    expect(extractMathContent(doc, region!)).toBe("x+y");
  });

  it("detects display math regions", () => {
    const doc = "before $$\na+b\n$$ after";
    const region = findMathRegionAt(doc, 10);
    expect(region?.kind).toBe("display");
    expect(extractMathContent(doc, region!)).toBe("\na+b\n");
  });

  it("prefers display math over inline when nested contexts overlap", () => {
    const doc = "$$x$$";
    const region = findMathRegionAt(doc, 3);
    expect(region?.kind).toBe("display");
  });

  it("returns null in plain text after closed inline math", () => {
    expect(findMathRegionAt("$x$ tail", 7)).toBeNull();
  });

  it("returns null in plain text after closed display math", () => {
    const doc = "$$\\alpha$$ tail";
    expect(findMathRegionAt(doc, doc.length)).toBeNull();
  });
});

describe("isInMath", () => {
  it("returns false outside math", () => {
    expect(isInMath("hello", 2)).toBe(false);
  });

  it("returns true inside inline math", () => {
    expect(isInMath("$a$", 2)).toBe(true);
  });
});

describe("shouldAutoWrapSnippet", () => {
  it("does not wrap inside inline math", () => {
    expect(shouldAutoWrapSnippet("$x+y$", 2, 2)).toBe(false);
  });

  it("does not wrap when inline math is unclosed before the cursor", () => {
    expect(shouldAutoWrapSnippet("$x+y", 4, 4)).toBe(false);
    expect(hasUnclosedInlineMathBefore("$x+y", 4)).toBe(true);
  });

  it("does not wrap when inserting immediately after inline math (avoids $$)", () => {
    expect(shouldAutoWrapSnippet("$x$x", 4, 4)).toBe(false);
  });

  it("wraps outside math", () => {
    expect(shouldAutoWrapSnippet("hello world", 6, 6)).toBe(true);
  });

  it("wraps in plain text after closed inline math", () => {
    expect(hasUnclosedInlineMathBefore("$x$ more text", 14)).toBe(false);
    expect(shouldAutoWrapSnippet("$x$ more text", 14, 14)).toBe(true);
  });

  it("wraps in plain text between closed inline math blocks", () => {
    const doc = "$a$ and $b$ tail";
    expect(hasUnclosedInlineMathBefore(doc, doc.length)).toBe(false);
    expect(shouldAutoWrapSnippet(doc, doc.length, doc.length)).toBe(true);
  });

  it("wraps in plain text after closed display math", () => {
    const doc = "$$\\alpha$$ more";
    expect(hasUnclosedInlineMathBefore(doc, doc.length)).toBe(false);
    expect(shouldAutoWrapSnippet(doc, doc.length, doc.length)).toBe(true);
  });

  it("wraps in plain text after closed inline with only a space separator", () => {
    expect(shouldAutoWrapSnippet("$x$ tail", 5, 5)).toBe(true);
  });
});

describe("resolveSnippetInsertPosition", () => {
  it("moves the cursor before the closing $ when touching inline math", () => {
    expect(resolveSnippetInsertPosition("$x$x", 4, 4)).toEqual({ from: 2, to: 2 });
  });

  it("keeps the cursor in plain text after a separator past inline math", () => {
    expect(resolveSnippetInsertPosition("$x$ tail", 5, 5)).toEqual({ from: 5, to: 5 });
  });

  it("keeps the cursor in plain text after closed display math", () => {
    const doc = "$$\\alpha$$ tail";
    const offset = doc.indexOf("t");
    expect(resolveSnippetInsertPosition(doc, offset, offset)).toEqual({ from: offset, to: offset });
  });
});

describe("hasUnclosedDisplayMath", () => {
  it("returns true for an odd number of $$ delimiters", () => {
    expect(hasUnclosedDisplayMath("$$x")).toBe(true);
  });

  it("returns false for balanced display blocks", () => {
    expect(hasUnclosedDisplayMath("$$x$$\n$$y$$")).toBe(false);
  });

  it("returns false when closed display math precedes plain text", () => {
    expect(hasUnclosedDisplayMath("$$\\alpha$$ tail")).toBe(false);
  });

  it("returns false when closed inline math precedes plain text", () => {
    expect(hasUnclosedDisplayMath("$x$ tail")).toBe(false);
  });
});
