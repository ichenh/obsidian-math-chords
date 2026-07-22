import { describe, expect, it } from "vitest";
import { expandSnippet, insertDisplayMath, insertInlineMath } from "../../src/snippet";

describe("expandSnippet", () => {
  it("replaces a single $$ with selection", () => {
    expect(expandSnippet("\\frac{$$}{}", "x")).toEqual({
      text: "\\frac{x}{}",
      anchor: 6,
      head: 7,
    });
  });

  it("leaves templates without $$ unchanged at end", () => {
    expect(expandSnippet("\\sum", "")).toEqual({
      text: "\\sum",
      anchor: 4,
      head: 4,
    });
  });
});

describe("math insertion placeholders", () => {
  it("places the caret between an empty inline pair", () => {
    expect(insertInlineMath("")).toEqual({ text: "$$", anchor: 1, head: 1 });
  });

  it("places the caret on the empty line in a display block", () => {
    expect(insertDisplayMath("")).toEqual({ text: "$$\n\n$$", anchor: 3, head: 3 });
  });
});
