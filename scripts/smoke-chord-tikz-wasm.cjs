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
  if (!outputs[3].includes('r="103.920"')) {
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
    Math.max(...plotYs) - Math.min(...plotYs) < 60
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
    !outputs[5].includes("marker-start=")
  ) {
    throw new Error("Mixed-label flowchart smoke test omitted overlay metadata.");
  }
  if (!outputs[5].includes("M 10 0 L 0 4.2 L 2.6 0 L 0 -4.2 Z")) {
    throw new Error("Stealth arrow smoke test used the wrong marker geometry.");
  }
  if ((outputs[6].match(/<polyline/g) ?? []).length !== 8) {
    throw new Error("Foreach range smoke test produced the wrong ray count.");
  }
  const expectedDimensions = [
    [137.386, 137.386],
    [106.623, 61.991],
    [284.787, 284.787],
    [335.759, 335.759],
    [409.512, 250.772],
    [409.512, 86.698],
    [341.48, 341.48],
  ];
  outputs.map(svgMetrics).forEach((metrics, index) => {
    const [expectedWidth, expectedHeight] = expectedDimensions[index];
    if (
      Math.abs(metrics.width - expectedWidth) > 0.001 ||
      Math.abs(metrics.height - expectedHeight) > 0.001 ||
      Math.abs(metrics.width / metrics.viewBox[2] - 1.5) > 0.001 ||
      Math.abs(metrics.height / metrics.viewBox[3] - 1.5) > 0.001
    ) {
      throw new Error(
        `WASM sample ${index + 1} changed its display bounds or scale.`,
      );
    }
  });
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
