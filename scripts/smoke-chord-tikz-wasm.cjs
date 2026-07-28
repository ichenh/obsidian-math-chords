const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const wasmPath = path.resolve(
  __dirname,
  "..",
  "crates",
  "chord-tikz-core",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "chord_tikz_core.wasm",
);

void WebAssembly.instantiate(fs.readFileSync(wasmPath), {}).then(({ instance }) => {
  const engine = instance.exports;
  const cases = [
    String.raw`\draw (0,0) circle (1cm);`,
    "\\node at (0,0) {\u4e2d\u6587 $\\rho\\ne\\tau$};",
    String.raw`\foreach \r in {0.8,1.5,2.3}{\draw[dashed] (0,0) circle (\r);}`,
    String.raw`\def\a{3.4}\def\b{2.0}\pgfmathsetmacro{\c}{sqrt(\a*\a-\b*\b)}\draw (0,0) circle (\c);`,
    String.raw`\def\a{3.4}\def\b{2.0}\draw (0,0) ellipse [x radius=\a, y radius=\b];\fill[black!12] (0,0) -- plot[domain=140:200, samples=50] ({\a*cos(\x)},{\b*sin(\x)}) -- cycle;`,
    String.raw`\begin{tikzpicture}[thick,box/.style={draw,rounded corners,align=center,minimum width=2.8cm,minimum height=0.9cm}]\node[box] (a) at (0,0) {force\\$F$};\node[box] (b) at (4,0) {B\\line};\draw[<->] (a) -- (b);\draw[->] (b.west) -- (a.south |- b.west) -- (a.south);\end{tikzpicture}`,
    String.raw`\foreach \angle in {0,45,...,315}{\draw (0,0) -- ({2.8*cos(\angle)},{2.8*sin(\angle)});}`,
    String.raw`\begin{tikzpicture}[x=1cm,y=1cm,every node/.style={font=\normalsize,outer sep=0pt},year/.style={draw,rounded corners=3pt,fill=gray!10,font=\bfseries\normalsize,minimum width=2.25cm,minimum height=0.84cm,inner xsep=6pt,inner ysep=3pt},event/.style={draw,rounded corners=4pt,align=left,text width=5.75cm,inner xsep=8pt,inner ysep=6pt},timeline/.style={very thick,->,shorten >=1pt,shorten <=1pt}]\node[year] (y1) at (0,0) {1600};\node[year] (y2) at (0,-3) {1800};\draw[timeline] (y1.south)--(y2.north);\node[event,anchor=west] at (2,0) {\textbf{Observation}\\[-1pt]A publication-style paragraph.};\end{tikzpicture}`,
    String.raw`\begin{tikzpicture}[scale=1.0,>=stealth,line cap=round,line join=round,every node/.style={font=\small}]\draw[thick,fill=gray!8] (-2.15,-2.05) rectangle (-1.90,2.05);\foreach \y in {-1.65,-1.10,-0.55,0,0.55,1.10,1.65}{\node at (-1.72,\y) {$+$};\node at (1.72,\y) {$-$};}\draw[->,thick] (-1.78,1.48) .. controls (-0.95,1.82) and (0.95,1.82) .. (1.78,1.48);\node[rotate=90] at (-2.55,0) {positive plate};\node[rotate=90] at (2.55,0) {negative plate};\end{tikzpicture}`,
    String.raw`\begin{tikzpicture}[x=1cm,y=1cm,scale=1.0]\draw[thick] plot[smooth] coordinates {(-2.10,0.58) (-2.90,0.78) (-2.70,1.95) (0,2.55) (2.70,1.95) (2.90,0.78) (2.10,0.58)};\draw[->,thick] (-0.30,2.55)--(0.30,2.55);\end{tikzpicture}`,
    String.raw`\begin{tikzpicture}[x=1cm,y=1cm,>=stealth,every node/.style={font=\small},line cap=round]\draw[->,thick] (0,0)--(8.65,0) node[right] {$r/\mathrm{m}$};\foreach \x/\lab in {2/0.10,4/0.20,6/0.30,8/0.40}{\draw (\x,0.08)--(\x,-0.08);\node[below=3pt] at (\x,0) {\lab};\draw[gray!35] (\x,0)--(\x,6.15);}\draw[densely dotted,thick] (2,0)--(2,6.25);\node[above right] at (2,6.05) {$r=R$};\draw[thick,smooth] plot coordinates {(2,6) (2.4,5) (3,4) (4,3) (5,2.4) (6,2) (7,1.714) (8,1.5)};\fill (4,3) circle (0.055);\node[above right=2pt] at (4,3) {P};\end{tikzpicture}`,
    String.raw`\begin{tikzpicture}[>=Latex]\draw[help lines,step=0.5cm] (0,0) grid (3,2);\filldraw[fill=cyan!20,draw=blue] (0,0)--(3,0)--(1.5,2)--cycle;\draw[-{Stealth},semithick] (2,0) arc (0:120:2);\draw[orange,line width=1pt,draw opacity=0.8] (0,0)--(30:3);\draw (0,-1)--node[midway,above] {$v$} ++(4,0);\coordinate (P) at (3,2);\node[above] at (P) {$P$};\node[circle,draw,minimum width=1cm] at (0,-2) {$q$};\end{tikzpicture}`,
    String.raw`\begin{tikzpicture}[>=stealth,box/.style={draw,rounded corners,minimum width=3cm}]\node[box] (field) at (3,0) {field};\node[box] (V) at (0,-2) {potential};\node[box] (E) at (6,-2) {strength};\draw[->] (field)--node[above,sloped,midway]{scalar}(V);\draw[->] (field)--node[above,sloped,midway]{vector}(E);\end{tikzpicture}`,
    String.raw`\begin{tikzpicture}[>=stealth]\begin{scope}[shift={(0,0)}]\draw (0,0) circle (1.2);\foreach \a in {0,30,...,330}{\draw[->] ({1.2*cos(\a)},{1.2*sin(\a)})--({2.45*cos(\a)},{2.45*sin(\a)});}\end{scope}\begin{scope}[shift={(6.5,0)}]\draw (0,0) circle (1.2);\foreach \a in {0,30,...,330}{\draw[<-] ({1.2*cos(\a)},{1.2*sin(\a)})--({2.45*cos(\a)},{2.45*sin(\a)});}\end{scope}\end{tikzpicture}`,
  ];
  const startedAt = performance.now();
  const outputs = cases.map(render);
  const duration = performance.now() - startedAt;
  if (!outputs[0].includes("<circle")) {
    throw new Error("Circle smoke test did not produce an SVG circle.");
  }
  if (!outputs[1].includes("\u4e2d\u6587 \u03c1\u2260\u03c4")) {
    throw new Error("CJK/Greek smoke test produced incorrect text.");
  }
  if ((outputs[2].match(/<circle/g) ?? []).length !== 3) {
    throw new Error("Foreach smoke test did not produce three SVG circles.");
  }
  if (!outputs[3].includes('r="77.940"')) {
    throw new Error("Numeric macro smoke test produced the wrong radius.");
  }
  if (!outputs[4].includes("<ellipse") || !outputs[4].includes(" Z\"")) {
    throw new Error("Ellipse/plot smoke test produced incomplete SVG.");
  }
  if (!outputs[4].includes('fill-opacity="0.120"')) {
    throw new Error("Xcolor percentage fill smoke test omitted opacity.");
  }
  const plotPath = /<path d="([^"]+)"/.exec(outputs[4])?.[1] ?? "";
  const plotPoints = [...plotPath.matchAll(/(?:M|L) (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  const plotYs = plotPoints.map(([, y]) => y);
  if (
    plotPoints.length !== 51 ||
    Math.max(...plotYs) - Math.min(...plotYs) < 45
  ) {
    throw new Error("Parametric plot smoke test used the wrong coordinate scale.");
  }
  if (
    (outputs[5].match(/<rect/g) ?? []).length !== 2 ||
    (outputs[5].match(/<polyline/g) ?? []).length !== 2 ||
    !outputs[5].includes("<tspan")
  ) {
    throw new Error("Named-node flowchart smoke test produced incomplete SVG.");
  }
  if (
    !outputs[5].includes("data-chord-text=") ||
    (outputs[5].match(/data-chord-arrowhead="true"/g) ?? []).length !== 3
  ) {
    throw new Error("Mixed-label flowchart smoke test omitted overlay metadata.");
  }
  if (
    !outputs[5].includes('fill="currentColor"') ||
    outputs[5].includes("<marker")
  ) {
    throw new Error("Stealth arrow smoke test did not emit portable path geometry.");
  }
  if ((outputs[6].match(/<polyline/g) ?? []).length !== 8) {
    throw new Error("Foreach range smoke test produced the wrong ray count.");
  }
  if (
    (outputs[7].match(/<rect/g) ?? []).length !== 3 ||
    !outputs[7].includes('data-chord-text-width="162.992"') ||
    !outputs[7].includes('data-chord-align="left"') ||
    !outputs[7].includes('data-chord-shorten-start="0.996"') ||
    !outputs[7].includes('data-chord-shorten-end="0.996"') ||
    !outputs[7].includes('data-chord-arrowhead="true"')
  ) {
    throw new Error("Publication-style timeline smoke test lost node semantics.");
  }
  if (
    (outputs[8].match(/data-chord-rotate="90.000"/g) ?? []).length !== 2 ||
    !outputs[8].includes('data-chord-arrowhead="true"') ||
    !outputs[8].includes("transform=\"rotate(-90.000")
  ) {
    throw new Error("Rotated plate-label smoke test lost vector semantics.");
  }
  if (
    (outputs[9].match(/ C /g) ?? []).length !== 6 ||
    !outputs[9].includes('data-chord-arrowhead="true"')
  ) {
    throw new Error("Smooth coordinate-plot smoke test lost cubic geometry.");
  }
  if (
    (outputs[10].match(/data-chord-text="0\./g) ?? []).length !== 4 ||
    (outputs[10].match(/stroke-opacity="0.350"/g) ?? []).length !== 4 ||
    !outputs[10].includes('stroke-dasharray="0.01 1.993"') ||
    !outputs[10].includes('data-chord-placement="below"') ||
    !outputs[10].includes('data-chord-gap="3.487"') ||
    !outputs[10].includes('data-chord-placement="above-right"') ||
    !outputs[10].includes('data-chord-gap="2.491"') ||
    !outputs[10].includes(" C ")
  ) {
    throw new Error("Coordinate-graph smoke test lost labels, styles, or smooth geometry.");
  }
  if (
    !outputs[11].includes("<polygon") ||
    !outputs[11].includes('stroke="orange"') ||
    !outputs[11].includes('stroke-opacity="0.800"') ||
    !outputs[11].includes('data-chord-math="v"') ||
    !outputs[11].includes('data-chord-math="P"') ||
    !outputs[11].includes('<circle data-chord-node-background="true"') ||
    !outputs[11].includes(" A ") ||
    !outputs[11].includes('data-chord-arrowhead="true"')
  ) {
    throw new Error("STEM vocabulary smoke test lost vector geometry or labels.");
  }
  if (
    (outputs[12].match(/data-chord-sloped="true"/g) ?? []).length !== 2 ||
    (outputs[12].match(/data-chord-arrowhead="true"/g) ?? []).length !== 2
  ) {
    throw new Error("Sloped-label smoke test lost rotation or arrow geometry.");
  }
  if (
    (outputs[13].match(/<circle/g) ?? []).length !== 2 ||
    (outputs[13].match(/data-chord-arrowhead="true"/g) ?? []).length !== 24 ||
    !outputs[13].includes('cx="184.252"')
  ) {
    throw new Error("Translated-scope smoke test lost conductor geometry.");
  }
  const expectedDimensions = [
    [109.039, 109.039],
    [112.418, 51.895],
    [219.591, 219.591],
    [257.82, 257.82],
    [313.134, 194.079],
    [313.134, 70.575],
    [262.11, 262.11],
    [425.273, 196.316],
    [266.953, 198.331],
    [287.824, 110.681],
    [424.353, 337.932],
    [236.598, 247.401],
    [406.677, 136.935],
    [508.724, 232.346],
  ];
  const dimensionMismatches = [];
  outputs.map(svgMetrics).forEach((metrics, index) => {
    const [expectedWidth, expectedHeight] = expectedDimensions[index];
    if (
      Math.abs(metrics.width - expectedWidth) > 0.001 ||
      Math.abs(metrics.height - expectedHeight) > 0.001 ||
      Math.abs(metrics.width / metrics.viewBox[2] - 1.5) > 0.001 ||
      Math.abs(metrics.height / metrics.viewBox[3] - 1.5) > 0.001
    ) {
      dimensionMismatches.push({
        sample: index + 1,
        expected: [expectedWidth, expectedHeight],
        actual: [metrics.width, metrics.height],
        viewBox: metrics.viewBox,
      });
    }
  });
  if (dimensionMismatches.length > 0) {
    throw new Error(
      `WASM samples changed display bounds or scale: ${JSON.stringify(dimensionMismatches)}`,
    );
  }
  process.stdout.write(
    `Rendered ${cases.length} WASM samples in ${duration.toFixed(3)} ms\n`,
  );

  function render(source) {
    const input = new TextEncoder().encode(source);
    const pointer = engine.chord_tikz_alloc(input.byteLength);
    new Uint8Array(engine.memory.buffer, pointer, input.byteLength).set(input);
    const status = engine.chord_tikz_render(pointer, input.byteLength);
    engine.chord_tikz_dealloc(pointer, input.byteLength);
    const output = new TextDecoder().decode(
      new Uint8Array(
        engine.memory.buffer,
        engine.chord_tikz_result_ptr(),
        engine.chord_tikz_result_len(),
      ),
    );
    if (status !== 0) throw new Error(output);
    return output;
  }

  function svgMetrics(svg) {
    const root = /<svg\b([^>]*)>/.exec(svg)?.[1] ?? "";
    const width = Number(/\bwidth="([0-9.]+)"/.exec(root)?.[1]);
    const height = Number(/\bheight="([0-9.]+)"/.exec(root)?.[1]);
    const viewBox = /\bviewBox="([^"]+)"/.exec(root)?.[1]
      ?.split(/\s+/)
      .map(Number);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      viewBox?.length !== 4 ||
      viewBox.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("A WASM smoke sample has invalid SVG display metrics.");
    }
    return { width, height, viewBox };
  }
});
