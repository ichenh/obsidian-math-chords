import { describe, expect, it } from "vitest";
import {
  findBraceStopsInMath,
  findNextBraceStop,
  findPrevBraceStop,
} from "./braceNav";

describe("findBraceStopsInMath", () => {
  it("lists brace contents inside inline math", () => {
    const doc = "text $\\frac{a}{b}$ tail";
    const stops = findBraceStopsInMath(doc, 10);
    expect(stops).toEqual([
      { start: 12, end: 13 },
      { start: 15, end: 16 },
    ]);
  });

  it("returns empty outside math", () => {
    expect(findBraceStopsInMath("hello {x}", 3)).toEqual([]);
  });
});

describe("findNextBraceStop", () => {
  const stops = [
    { start: 1, end: 2 },
    { start: 4, end: 5 },
  ];

  it("moves from first to second brace", () => {
    expect(findNextBraceStop(stops, 1)).toEqual(stops[1]);
  });

  it("returns null at the last brace", () => {
    expect(findNextBraceStop(stops, 4)).toBeNull();
  });
});

describe("findPrevBraceStop", () => {
  const stops = [
    { start: 1, end: 2 },
    { start: 4, end: 5 },
  ];

  it("moves from second to first brace", () => {
    expect(findPrevBraceStop(stops, 4)).toEqual(stops[0]);
  });

  it("returns null at the first brace", () => {
    expect(findPrevBraceStop(stops, 1)).toBeNull();
  });
});
