import { describe, expect, it } from "vitest";
import {
  areAllFormulaPanelGroupsCollapsed,
  countFormulaPanelMatches,
  groupFormulaPanelShortcuts,
  mathEnvironmentMatchesSearch,
  reorderFormulaPanelGroups,
} from "../../src/formulaPanelModel";

const shortcuts = [
  { keys: "F", command: "\\frac{$$}{}", name: "Fraction", group: "Structures" },
  { keys: "G A", command: "\\alpha", name: "Alpha", group: "Greek" },
  { keys: "X", command: "x" },
];

describe("formula panel model", () => {
  it("detects when every visible group is collapsed", () => {
    expect(areAllFormulaPanelGroupsCollapsed([], [])).toBe(false);
    expect(areAllFormulaPanelGroupsCollapsed(["Structures", "Greek"], ["Structures"])).toBe(
      false,
    );
    expect(
      areAllFormulaPanelGroupsCollapsed(
        ["Structures", "Greek"],
        ["Structures", "Greek", "Hidden"],
      ),
    ).toBe(true);
  });

  it("preserves shortcut and group order", () => {
    expect(groupFormulaPanelShortcuts(shortcuts, "Ungrouped")).toEqual([
      { id: "Structures", name: "Structures", shortcuts: [shortcuts[0]] },
      { id: "Greek", name: "Greek", shortcuts: [shortcuts[1]] },
      { id: "", name: "Ungrouped", shortcuts: [shortcuts[2]] },
    ]);
  });

  it("applies the preferred order and appends unknown groups stably", () => {
    expect(
      groupFormulaPanelShortcuts(shortcuts, "Ungrouped", ["Greek", "Structures"]).map(
        (group) => group.id,
      ),
    ).toEqual(["Greek", "Structures", ""]);
  });

  it("counts matches across names, keys, commands, and groups", () => {
    const groups = groupFormulaPanelShortcuts(shortcuts, "Ungrouped");
    expect(countFormulaPanelMatches(groups, "alpha")).toBe(1);
    expect(countFormulaPanelMatches(groups, "G A")).toBe(1);
    expect(countFormulaPanelMatches(groups, "Structures")).toBe(1);
    expect(countFormulaPanelMatches(groups, "missing")).toBe(0);
  });

  it("reorders groups without mutating the source order", () => {
    const source = ["Structures", "Greek", "Operators"];
    expect(reorderFormulaPanelGroups(source, 0, 2)).toEqual([
      "Greek",
      "Operators",
      "Structures",
    ]);
    expect(reorderFormulaPanelGroups(source, -1, 2)).toEqual(source);
    expect(source).toEqual(["Structures", "Greek", "Operators"]);
  });

  it("searches math environments by name and LaTeX source", () => {
    const cases = {
      name: "cases",
      begin: "\\begin{cases}",
      end: "\\end{cases}",
    };
    expect(mathEnvironmentMatchesSearch(cases, "Math environments", "cases")).toBe(true);
    expect(mathEnvironmentMatchesSearch(cases, "Math environments", "environment")).toBe(true);
    expect(mathEnvironmentMatchesSearch(cases, "Math environments", "matrix")).toBe(false);
  });
});
