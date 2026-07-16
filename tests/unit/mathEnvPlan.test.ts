import { describe, expect, it } from "vitest";
import { planMathEnvironmentWrap } from "../../src/mathEnvPlan";

const aligned = {
  name: "aligned",
  begin: "\\begin{aligned}",
  end: "\\end{aligned}",
};

describe("planMathEnvironmentWrap", () => {
  it("creates and wraps display math in one replacement", () => {
    expect(planMathEnvironmentWrap("before x after", 7, 8, aligned)).toEqual({
      type: "replace",
      from: 7,
      to: 8,
      text: "$$\n\\begin{aligned}\nx\n\\end{aligned}\n$$",
      caret: 26,
    });
  });

  it("wraps an existing display block without nesting delimiters", () => {
    expect(planMathEnvironmentWrap("$$\nx+y\n$$", 4, 4, aligned)).toMatchObject({
      type: "replace",
      from: 0,
      to: 9,
      text: "$$\n\\begin{aligned}\nx+y\n\\end{aligned}\n$$",
    });
  });

  it("recognizes a selected display block in either direction", () => {
    for (const [anchor, head] of [[0, 9], [9, 0]]) {
      expect(planMathEnvironmentWrap("$$\nx+y\n$$", anchor, head, aligned)).toMatchObject({
        type: "replace",
        from: 0,
        to: 9,
        text: "$$\n\\begin{aligned}\nx+y\n\\end{aligned}\n$$",
      });
    }
  });

  it("refuses a selection that crosses an existing math boundary", () => {
    expect(planMathEnvironmentWrap("before $x$ after", 5, 12, aligned)).toEqual({
      type: "blocked",
      reason: "selection-overlaps-math",
    });
  });

  it("creates an editable empty line for an empty selection", () => {
    const plan = planMathEnvironmentWrap("", 0, 0, aligned);
    expect(plan).toMatchObject({
      type: "replace",
      text: "$$\n\\begin{aligned}\n\n\\end{aligned}\n$$",
    });
    if (plan.type === "replace") {
      expect(plan.text.slice(plan.caret, plan.caret + 1)).toBe("\n");
    }
  });

  it("preserves CRLF style and blocks inline math", () => {
    expect(planMathEnvironmentWrap("$$\r\nx\r\n$$", 4, 4, aligned)).toMatchObject({
      type: "replace",
      text: "$$\r\n\\begin{aligned}\r\nx\r\n\\end{aligned}\r\n$$",
    });
    expect(planMathEnvironmentWrap("$x$", 1, 1, aligned)).toEqual({
      type: "blocked",
      reason: "inline-math",
    });
  });
});
