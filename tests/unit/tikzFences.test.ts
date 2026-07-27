import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { findTikzFenceBlocks } from "../../src/tikz/fences";

describe("TikZ fenced-code discovery", () => {
  it("finds backtick and tilde fences for the configured language", () => {
    const state = EditorState.create({
      doc: [
        "before",
        "```tikz",
        "\\draw (0,0) circle (1);",
        "```",
        "~~~tikz",
        "\\node {x};",
        "~~~~",
      ].join("\n"),
    });
    expect(findTikzFenceBlocks(state.doc, "tikz").map((block) => block.source)).toEqual([
      "\\draw (0,0) circle (1);",
      "\\node {x};",
    ]);
  });

  it("does not claim other code-block languages", () => {
    const state = EditorState.create({
      doc: "```tikz\n\\draw (0,0);\n```",
    });
    expect(findTikzFenceBlocks(state.doc, "tikz-math-chords")).toEqual([]);
  });
});
