import { describe, expect, it } from "vitest";
import { rewriteTikzSvgLocalReferences } from "../../src/tikz/svgInstances";

describe("TikZ SVG instance references", () => {
  const ids = new Map([
    ["chord-arrow", "diagram-2-chord-arrow"],
    ["clip.1", "diagram-2-clip.1"],
  ]);

  it("rewrites direct href and paint-server references", () => {
    expect(rewriteTikzSvgLocalReferences("#clip.1", ids)).toBe(
      "#diagram-2-clip.1",
    );
    expect(
      rewriteTikzSvgLocalReferences("url(#chord-arrow)", ids),
    ).toBe("url(#diagram-2-chord-arrow)");
    expect(
      rewriteTikzSvgLocalReferences("url('#chord-arrow')", ids),
    ).toBe("url('#diagram-2-chord-arrow')");
  });

  it("preserves external text and unknown local references", () => {
    expect(rewriteTikzSvgLocalReferences("none", ids)).toBe("none");
    expect(rewriteTikzSvgLocalReferences("url(#other)", ids)).toBe(
      "url(#other)",
    );
  });
});
