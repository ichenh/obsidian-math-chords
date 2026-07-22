import { describe, expect, it } from "vitest";
import { findMathRegionAtForEdit } from "../../src/math";
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

  it("converts an empty inline placeholder to an empty display block", () => {
    expect(planMathToggle("$$", 1, 1, "display", true)).toEqual({
      type: "replace",
      from: 0,
      to: 2,
      text: "$$\n\n$$",
      caret: 3,
    });
  });

  it("unwraps an empty inline placeholder with the matching command", () => {
    expect(planMathToggle("$$", 1, 1, "inline", false)).toEqual({
      type: "replace",
      from: 0,
      to: 2,
      text: "",
      caret: 0,
    });
  });

  it("round-trips an empty display block through the inline placeholder", () => {
    const inlinePlan = planMathToggle("$$\n\n$$", 3, 3, "inline", true);
    expect(inlinePlan).toEqual({
      type: "replace",
      from: 0,
      to: 6,
      text: "$$",
      caret: 1,
    });
    expect(planMathToggle("$$", 1, 1, "display", true)).toMatchObject({
      type: "replace",
      text: "$$\n\n$$",
      caret: 3,
    });
  });

  it("trims invalid inline boundary whitespace after display conversion", () => {
    const plan = planMathToggle("$$\n x \n$$", 5, 5, "inline", true);
    expect(plan).toMatchObject({ type: "replace", text: "$x$", caret: 2 });
    if (plan.type !== "replace") throw new Error("Expected a replacement plan");
    expect(findMathRegionAtForEdit(plan.text, plan.caret)?.kind).toBe("inline");
  });

  it("normalizes CRLF display wrappers and content", () => {
    expect(planMathToggle("$$\r\na\r\nb\r\n$$", 7, 7, "inline", true)).toMatchObject({
      type: "replace",
      text: "$a b$",
    });
  });

  it("preserves CRLF when converting inline math to display math", () => {
    expect(planMathToggle("before\r\n$x$", 10, 10, "display", true)).toMatchObject({
      type: "replace",
      text: "$$\r\nx\r\n$$",
      caret: 13,
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
