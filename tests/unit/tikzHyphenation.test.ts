import { describe, expect, it } from "vitest";
import { hyphenateEnglishTikzText } from "../../src/tikz/hyphenation";

describe("TikZ English hyphenation", () => {
  it("adds TeX-pattern discretionary breaks to publication text", () => {
    expect(
      hyphenateEnglishTikzText(
        "investigates quantitatively generate connection magnetic unified identified",
      ),
    ).toBe(
      [
        "in\u00adves\u00adti\u00adgates",
        "quan\u00adti\u00adta\u00adtive\u00adly",
        "gen\u00ader\u00adate",
        "con\u00adnec\u00adtion",
        "mag\u00adnet\u00adic",
        "uni\u00adfied",
        "iden\u00adti\u00adfied",
      ].join(" "),
    );
  });

  it("preserves source text while allowing accented words to break", () => {
    const source = "Ørsted, Ampère, emf and Ohm.";
    const hyphenated = hyphenateEnglishTikzText(source);

    expect(hyphenated).toBe("Ørst\u00aded, Am\u00adpère, emf and Ohm.");
    expect(hyphenated.replace(/\u00ad/g, "")).toBe(source);
  });
});
