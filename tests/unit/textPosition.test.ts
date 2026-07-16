import { describe, expect, it } from "vitest";
import { offsetToTextPosition, replaceTextRange } from "../../src/textPosition";

describe("offsetToTextPosition", () => {
  it("maps offsets after newly inserted lines", () => {
    expect(offsetToTextPosition("before\n$$\nx\n$$\nafter", 13)).toEqual({ line: 3, ch: 1 });
  });

  it("clamps offsets to the document", () => {
    expect(offsetToTextPosition("a\nb", 99)).toEqual({ line: 1, ch: 1 });
    expect(offsetToTextPosition("a\nb", -1)).toEqual({ line: 0, ch: 0 });
  });
});

describe("replaceTextRange", () => {
  it("constructs the post-transaction document", () => {
    expect(replaceTextRange("left $x$ right", 5, 8, "$$\nx\n$$")).toBe("left $$\nx\n$$ right");
  });
});
