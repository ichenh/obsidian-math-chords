import { describe, expect, it } from "vitest";
import { tikzAccessibleName } from "../../src/tikz/accessibility";

describe("TikZ accessibility metadata", () => {
  it("uses a concise alt comment without exposing the rest of the source", () => {
    expect(
      tikzAccessibleName(
        String.raw`% alt: Gravitational field around a point mass
\begin{tikzpicture}
  \draw (0,0) circle (1);
\end{tikzpicture}`,
      ),
    ).toBe("Gravitational field around a point mass");
  });

  it("does not add a generic hover label when no alt comment is present", () => {
    expect(tikzAccessibleName(String.raw`\draw (0,0) -- (1,1);`)).toBe("");
  });
});
