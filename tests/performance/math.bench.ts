import { bench, describe } from "vitest";
import { findLatexDelimiterConversions } from "../../src/delimiterConverter";
import { findMathRegionAtForEdit, hasUnclosedDisplayMath } from "../../src/math";

const noteA = `${"plain text ".repeat(5_000)}$x+y$`;
const noteB = `${"plain text ".repeat(5_000)}$a+b$`;
let current = false;

describe("large-note math parsing", () => {
  bench("reuse analysis for unchanged note", () => {
    findMathRegionAtForEdit(noteA, noteA.length - 2);
    hasUnclosedDisplayMath(noteA);
  });

  bench("rebuild analysis after note text changes", () => {
    current = !current;
    const note = current ? noteA : noteB;
    findMathRegionAtForEdit(note, note.length - 2);
  });

  bench("scan imported LaTeX delimiters with Markdown protection", () => {
    findLatexDelimiterConversions(`${noteA} and \\(z\\)`);
  });
});
