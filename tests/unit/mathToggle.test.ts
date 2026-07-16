import { describe, expect, it } from "vitest";
import { planMathToggle } from "../../src/mathToggle";

describe("planMathToggle", () => {
  it.each([
    ["inline", "$x$", 1, 3],
    ["display", "$$\nx\n$$", 2, 7],
  ] as const)("always unwraps the same %s kind", (kind, document, caret, to) => {
    const plan = planMathToggle(document, caret, caret, kind, false);
    expect(plan).toMatchObject({ type: "replace", from: 0, to });
  });

  it("converts inline math to display math when enabled", () => {
    expect(planMathToggle("$x+y$", 3, 3, "display", true)).toEqual({
      type: "replace",
      from: 0,
      to: 5,
      text: "$$\nx+y\n$$",
      caret: 5,
    });
  });

  it("converts display math to valid single-line inline math", () => {
    expect(planMathToggle("$$\na +\nb\n$$", 7, 7, "inline", true)).toEqual({
      type: "replace",
      from: 0,
      to: 11,
      text: "$a + b$",
      caret: 5,
    });
  });

  it("normalizes CRLF display wrappers and content", () => {
    expect(planMathToggle("$$\r\na\r\nb\r\n$$", 7, 7, "inline", true)).toMatchObject({
      type: "replace",
      text: "$a b$",
    });
  });

  it("blocks cross-kind conversion when the setting is disabled", () => {
    expect(planMathToggle("$x$", 1, 1, "display", false)).toEqual({
      type: "blocked",
      reason: "cross-kind-disabled",
    });
  });

  it.each([
    [0, 2],
    [2, 0],
  ])("always sends a non-empty selection to insertion (%i to %i)", (anchor, head) => {
    expect(planMathToggle("$x$", anchor, head, "display", true)).toEqual({ type: "insert" });
  });

  it.each([0, 3])("treats offset %i outside $x$ as normal text", (offset) => {
    expect(planMathToggle("$x$", offset, offset, "inline", true)).toEqual({ type: "insert" });
  });

  it("preserves the caret while unwrapping", () => {
    expect(planMathToggle("before $xyz$ after", 9, 9, "inline", true)).toEqual({
      type: "replace",
      from: 7,
      to: 12,
      text: "xyz",
      caret: 8,
    });
  });

  it("does not insert nested delimiters in a large document", () => {
    const prefix = "a".repeat(100_001);
    expect(planMathToggle(`${prefix}$x$`, prefix.length + 1, prefix.length + 1, "inline", true))
      .toMatchObject({ type: "replace", text: "x" });
  });
});
