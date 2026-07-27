import { describe, expect, it } from "vitest";
import { analyzeTikzCapabilities } from "../../src/tikz/capabilityAnalyzer";

describe("TikZ capability analyzer", () => {
  it("keeps the supported vector subset on the fast path", () => {
    const result = analyzeTikzCapabilities(String.raw`
      \begin{tikzpicture}[scale=0.95, line cap=round]
        \draw[->] (0,0) -- (4.8,0);
        \draw[thick] (0.45,-3.0)
          .. controls (0.75,-1.75) and (1.40,-0.85) .. (4.40,-0.28);
        \node[fill=white, inner sep=1pt] at (2,1) {$\vec a$};
      \end{tikzpicture}
    `);

    expect(result).toEqual({ tier: "vector", features: [] });
  });

  it("keeps the supported orbital diagram subset on the vector tier", () => {
    const result = analyzeTikzCapabilities(String.raw`
      \def\a{3.4}
      \def\b{2.0}
      \pgfmathsetmacro{\c}{sqrt(\a*\a-\b*\b)}
      \draw (0,0) ellipse [x radius=\a, y radius=\b];
      \fill (-\c,0) -- plot[domain=140:200]
        ({\a*cos(\x)},{\b*sin(\x)}) -- cycle;
      \node[below] at (-\c,0) {Sun};
    `);

    expect(result).toEqual({ tier: "vector", features: [] });
  });

  it("routes unsupported node anchors to the compatibility tier", () => {
    expect(
      analyzeTikzCapabilities(
        String.raw`\node[anchor=north] at (0,0) {advanced};`,
      ),
    ).toEqual({ tier: "compatibility", features: ["advanced-node"] });
  });

  it("keeps bounded ellipses and parametric plots on the vector tier", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \def\a{3.4}
        \def\b{2.0}
        \draw (0,0) ellipse [x radius=\a, y radius=\b];
        \fill (0,0) -- plot[domain=140:200, samples=50]
          ({\a*cos(\x)},{\b*sin(\x)}) -- cycle;
      `),
    ).toEqual({ tier: "vector", features: [] });
  });

  it("keeps bounded numeric macros and foreach loops on the vector tier", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \def\a{3.4}
        \def\b{2.0}
        \pgfmathsetmacro{\c}{sqrt(\a*\a-\b*\b)}
        \foreach \r in {0.8,1.5,\c}{
          \draw[dashed] (0,0) circle (\r);
        }
      `),
    ).toEqual({ tier: "vector", features: [] });
  });

  it("routes foreach options outside the bounded subset to compatibility", () => {
    expect(
      analyzeTikzCapabilities(
        String.raw`\foreach \x [evaluate=\x as \y using \x^2] in {1,2}{\draw (0,0) circle (\y);}`,
      ).tier,
    ).toBe("compatibility");
  });

  it("keeps basic named-node flowcharts on the vector tier", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \begin{tikzpicture}[
          every node/.style={font=\small},
          box/.style={
            draw,
            rounded corners,
            minimum width=2.8cm,
            minimum height=0.9cm
          }
        ]
          \node[box] (obs) at (0,0) {Observation};
          \node[box] (law) at (4,0) {Law};
          \draw[->] (obs) -- (law);
          \draw[->] (law.west) -- (obs.south |- law.west) -- (obs.south);
        \end{tikzpicture}
      `),
    ).toEqual({ tier: "vector", features: [] });
  });

  it("routes unsupported custom node styles to compatibility", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \begin{tikzpicture}[box/.style={draw, drop shadow}]
          \node[box] at (0,0) {Unsupported};
        \end{tikzpicture}
      `).tier,
    ).toBe("compatibility");
  });

  it("routes unknown picture and path options instead of ignoring them", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \begin{tikzpicture}[transform shape]
          \draw[opacity=0.5] (0,0) -- (1,1);
        \end{tikzpicture}
      `).features,
    ).toContain("unsupported-option");
  });

  it("keeps the explicitly supported picture and path options fast", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \begin{tikzpicture}[
          scale=1.0,
          >=stealth,
          line cap=round,
          line join=round,
          every node/.style={font=\small}
        ]
          \fill[black!12] (0,0) circle (1);
          \draw[->, very thick, red] (0,0) -- (1,1);
        \end{tikzpicture}
      `),
    ).toEqual({ tier: "vector", features: [] });
  });

  it("keeps mixed-math flowcharts and foreach ranges on the vector tier", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        \begin{tikzpicture}[
          thick,
          every node/.style={font=\small},
          box/.style={
            draw,
            rounded corners,
            align=center,
            minimum width=3.1cm,
            minimum height=1.0cm
          }
        ]
          \foreach \angle in {0,45,...,315}{
            \draw (0,0) -- ({2.8*cos(\angle)},{2.8*sin(\angle)});
          }
          \node[font=\bfseries] at (6,5.22) {Title};
          \node[box] (F1) at (0,4) {force\\$F$};
          \node[right, xshift=3pt] at (0.2,2.4)
            {$W_{\mathrm g}=-\Delta E_{\mathrm p}$};
          \draw[<->, dashed] (F1) -- (0,0);
        \end{tikzpicture}
      `),
    ).toEqual({ tier: "vector", features: [] });
  });

  it("does not treat examples inside comments as required features", () => {
    expect(
      analyzeTikzCapabilities(String.raw`
        % \def\a{3} and plot[domain=0:1] are examples only.
        \draw (0,0) circle (1);
      `),
    ).toEqual({ tier: "vector", features: [] });
  });
});
