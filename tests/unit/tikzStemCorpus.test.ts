import { describe, expect, it } from "vitest";
import { analyzeTikzCapabilities } from "../../src/tikz/capabilityAnalyzer";

interface CorpusCase {
  name: string;
  source: string;
}

const vectorCases: CorpusCase[] = [
  {
    name: "mechanics vectors with polar and relative coordinates",
    source: String.raw`\begin{tikzpicture}[>=Latex]
      \draw[->,very thick] (0,0)--(35:3) node[above right] {$F$};
      \draw[->,thick] (0,0)--++(0,-2) node[below] {$mg$};
    \end{tikzpicture}`,
  },
  {
    name: "graph paper and measurement styles",
    source: String.raw`\begin{tikzpicture}
      \draw[help lines,step=0.5cm] (0,0) grid (4,3);
      \draw[orange,line width=1pt,draw opacity=0.8] (0,0)--(4,3);
      \draw[purple,densely dashed] (0,3)--(4,0);
    \end{tikzpicture}`,
  },
  {
    name: "closed geometry and classic arc syntax",
    source: String.raw`\begin{tikzpicture}
      \filldraw[fill=cyan!20,draw=blue] (0,0)--(3,0)--(1.5,2)--cycle;
      \draw (0,0) circle[radius=0.5cm];
      \draw[->] (2,0) arc (0:120:2);
    \end{tikzpicture}`,
  },
  {
    name: "named coordinates and anchored connectors",
    source: String.raw`\begin{tikzpicture}
      \coordinate (O) at (0,0);
      \coordinate (P) at (3,2);
      \draw[->] (O)--(P);
      \node[above] at (P) {$P$};
    \end{tikzpicture}`,
  },
  {
    name: "inline scientific labels along paths",
    source: String.raw`\begin{tikzpicture}
      \draw[->] (0,0)--node[midway,above] {$v$} (4,1);
      \draw (0,-1)--(4,-1) node[pos=0.75,below] {distance};
    \end{tikzpicture}`,
  },
  {
    name: "bounded scientific function plot",
    source: String.raw`\begin{tikzpicture}
      \draw[thick] plot[domain=0:6.28,samples=64] ({\x},{sin(\x)});
      \draw[smooth] plot coordinates {(0,0) (1,1) (2,0) (3,-1)};
    \end{tikzpicture}`,
  },
  {
    name: "publication nodes and common xcolor names",
    source: String.raw`\begin{tikzpicture}[
      box/.style={draw,rounded corners,fill=orange!15,text width=4cm,align=left}
    ]
      \node[box] (a) at (0,0) {\textbf{Input}\\Measured value};
      \node[box] (b) at (5,0) {\textbf{Output}\\Calculated value};
      \draw[-{Stealth},semithick] (a.east)--(b.west);
    \end{tikzpicture}`,
  },
  {
    name: "circular state and particle nodes",
    source: String.raw`\begin{tikzpicture}
      \node[circle,draw,fill=blue!10,minimum width=1cm] (a) at (0,0) {$q_1$};
      \node[circle,draw] (b) at (3,0) {$q_2$};
      \draw[->] (a)--(b);
    \end{tikzpicture}`,
  },
];

const compatibilityCases: CorpusCase[] = [
  {
    name: "pgfplots axes",
    source: String.raw`\begin{axis}\addplot {x^2};\end{axis}`,
  },
  {
    name: "circuitikz components",
    source: String.raw`\begin{circuitikz}\draw (0,0) to[R] (2,0);\end{circuitikz}`,
  },
  {
    name: "scoped transformations",
    source: String.raw`\begin{tikzpicture}\begin{scope}[rotate=30]\draw (0,0)--(1,0);\end{scope}\end{tikzpicture}`,
  },
  {
    name: "calc coordinate arithmetic",
    source: String.raw`\begin{tikzpicture}\node (a) at (0,0) {A};\node at ($(a)+(1,2)$) {B};\end{tikzpicture}`,
  },
  {
    name: "patterns and decorations",
    source: String.raw`\begin{tikzpicture}\draw[pattern=north east lines,decorate,decoration=snake] (0,0)--(3,0);\end{tikzpicture}`,
  },
  {
    name: "three dimensional coordinates",
    source: String.raw`\begin{tikzpicture}\draw (0,0,0)--(1,2,3);\end{tikzpicture}`,
  },
  {
    name: "matrices and graph syntax",
    source: String.raw`\begin{tikzpicture}\matrix (m) {A & B\\ C & D\\};\graph {a -> b};\end{tikzpicture}`,
  },
  {
    name: "clipping and shading",
    source: String.raw`\begin{tikzpicture}\clip (0,0) circle (1);\shade (0,0) rectangle (2,2);\end{tikzpicture}`,
  },
];

const vectorPathOptions = [
  "->",
  "<-",
  "<->",
  "-{Stealth}",
  "-{Latex}",
  "ultra thin",
  "very thin",
  "thin",
  "semithick",
  "thick",
  "very thick",
  "ultra thick",
  "dashed",
  "densely dashed",
  "loosely dashed",
  "dotted",
  "densely dotted",
  "loosely dotted",
  "help lines",
  "line width=0.8pt",
  "opacity=0.6",
  "draw opacity=0.7",
  "fill opacity=0.2",
  "red",
  "orange!30",
  "draw=purple",
  "fill=cyan!15",
] as const;

const vectorNodePlacements = [
  "above",
  "below",
  "left",
  "right",
  "above left",
  "above right",
  "below left",
  "below right",
  "above=3pt",
  "below=1mm",
  "left=0.2cm",
  "right=4bp",
] as const;

const compatibilityFragments = [
  String.raw`\draw[double] (0,0)--(1,0);`,
  String.raw`\draw[rounded corners] (0,0)--(1,0)--(1,1);`,
  String.raw`\draw[dash pattern=on 2pt off 1pt] (0,0)--(1,0);`,
  String.raw`\draw[opacity=1.5] (0,0)--(1,0);`,
  String.raw`\draw[-{Stealth[length=4mm]}] (0,0)--(1,0);`,
  String.raw`\draw (0,0) to[out=30,in=150] (2,0);`,
  String.raw`\draw (0,0) parabola (2,2);`,
  String.raw`\draw (0,0) |- (2,1);`,
  String.raw`\draw (0,0) -| (2,1);`,
  String.raw`\draw (0,0) .. node[midway] {x} controls (1,1) and (2,1) .. (3,0);`,
  String.raw`\draw[decorate,decoration={snake}] (0,0)--(2,0);`,
  String.raw`\draw[pattern=dots] (0,0) rectangle (2,1);`,
  String.raw`\node[label=above:A] at (0,0) {};`,
  String.raw`\node[pin=30:$F$] at (0,0) {};`,
  String.raw`\node[right=of a] (b) {B};`,
  String.raw`\node[sloped,midway] at (0,0) {x};`,
  String.raw`\begin{tikzpicture}[xscale=2]\draw (0,0)--(1,0);\end{tikzpicture}`,
  String.raw`\begin{tikzpicture}[x=2cm]\draw (0,0)--(1,0);\end{tikzpicture}`,
  String.raw`\draw plot[domain=0:1,variable=\t] ({\t},{\t});`,
  String.raw`\draw plot[domain=0:1,samples=500] ({\x},{\x});`,
  String.raw`\draw plot[mark=*] coordinates {(0,0) (1,1)};`,
  String.raw`\draw (1,0) arc[start angle=0,end angle=180,x radius=1,y radius=2];`,
  String.raw`\draw (1,0) arc[start angle=0,delta angle=90,radius=1];`,
  String.raw`\draw (0,0) circle[x radius=1,y radius=2];`,
  String.raw`\path (0,0) edge[bend left] (2,0);`,
  String.raw`\coordinate[label=above:A] (A) at (0,0);`,
  String.raw`\coordinate (A);`,
  String.raw`\pic {angle=A--B--C};`,
  String.raw`\draw (0,0,0)--(1,1,1);`,
] as const;

describe("TikZ STEM compatibility corpus", () => {
  for (const sample of vectorCases) {
    it(`keeps ${sample.name} on the publication vector tier`, () => {
      expect(analyzeTikzCapabilities(sample.source)).toEqual({
        tier: "vector",
        features: [],
      });
    });
  }

  for (const sample of compatibilityCases) {
    it(`routes ${sample.name} to local TeX`, () => {
      expect(analyzeTikzCapabilities(sample.source).tier).toBe(
        "compatibility",
      );
    });
  }

  for (const option of vectorPathOptions) {
    it(`accepts common path option: ${option}`, () => {
      expect(
        analyzeTikzCapabilities(
          String.raw`\begin{tikzpicture}\draw[${option}] (0,0)--(1,1);\end{tikzpicture}`,
        ),
      ).toEqual({ tier: "vector", features: [] });
    });
  }

  for (const placement of vectorNodePlacements) {
    it(`accepts common node placement: ${placement}`, () => {
      expect(
        analyzeTikzCapabilities(
          String.raw`\begin{tikzpicture}\node[${placement}] at (0,0) {x};\end{tikzpicture}`,
        ),
      ).toEqual({ tier: "vector", features: [] });
    });
  }

  for (const source of compatibilityFragments) {
    it(`never silently accepts unsupported syntax: ${source}`, () => {
      expect(analyzeTikzCapabilities(source).tier).toBe("compatibility");
    });
  }
});
