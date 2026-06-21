import { describe, expect, it } from "vitest";
import { expandSnippet } from "./snippet";

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
