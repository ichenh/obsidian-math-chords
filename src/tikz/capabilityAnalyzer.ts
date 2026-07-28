export type TikzCompatibilityFeature =
  | "macro-definition"
  | "pgf-math"
  | "parametric-plot"
  | "ellipse"
  | "coordinate-expression"
  | "custom-style"
  | "advanced-node"
  | "advanced-path"
  | "unsupported-option"
  | "unsupported-command";

export interface TikzCapabilityAnalysis {
  tier: "vector" | "compatibility";
  features: TikzCompatibilityFeature[];
}

const UNSUPPORTED_COMMAND_RE =
  /\\(?:clip|coordinate|graph|matrix|path|pattern|pic|scope|shade|shadedraw|useasboundingbox)\b/;

const SUPPORTED_NODE_FONT_RE =
  /^font\s*=\s*(?:\\(?:bfseries|mdseries|itshape|upshape|tiny|scriptsize|small|normalsize|large|Large)\s*)+$/;

export function analyzeTikzCapabilities(source: string): TikzCapabilityAnalysis {
  const content = stripTikzComments(source);
  const features = new Set<TikzCompatibilityFeature>();
  const supportedNodeStyles = supportedBasicNodeStyles(content);
  const supportedPathStyles = supportedBasicPathStyles(content);
  const supportedStyles = new Set([
    ...supportedNodeStyles,
    ...supportedPathStyles,
  ]);

  if (hasUnsupportedMacroDefinitions(content)) {
    features.add("macro-definition");
  }
  if (hasUnsupportedPgfMath(content)) {
    features.add("pgf-math");
  }
  if (hasUnsupportedParametricPlots(content)) features.add("parametric-plot");
  if (hasUnsupportedEllipses(content)) features.add("ellipse");
  if (hasUnsupportedCoordinateExpressions(content)) {
    features.add("coordinate-expression");
  }
  if (hasUnsupportedCustomStyles(content, supportedStyles)) {
    features.add("custom-style");
  }
  if (
    hasUnsupportedPictureOptions(content, supportedStyles) ||
    hasUnsupportedPathOptions(content, supportedPathStyles)
  ) {
    features.add("unsupported-option");
  }
  if (
    /(?:\+\+|\bto\s*\[|\bdecorate\b|\bparabola\b)/.test(content) ||
    hasUnsupportedCycles(content)
  ) {
    features.add("advanced-path");
  }
  if (
    UNSUPPORTED_COMMAND_RE.test(content) ||
    (content.includes("\\foreach") && !hasOnlySimpleForeachLoops(content))
  ) {
    features.add("unsupported-command");
  }

  for (const match of content.matchAll(/\\node\s*\[([^\]]+)\]/g)) {
    const options = match[1]
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    if (
      options.some(
        (option) =>
          !isSupportedNodeStyleOption(option) &&
          !isSupportedNodeShift(option) &&
          !supportedNodeStyles.has(option) &&
          ![
            "above",
            "below",
            "left",
            "right",
            "above left",
            "left above",
            "above right",
            "right above",
            "below left",
            "left below",
            "below right",
            "right below",
          ].includes(option),
      )
    ) {
      features.add("advanced-node");
    }
  }

  return {
    tier: features.size === 0 ? "vector" : "compatibility",
    features: [...features],
  };
}

function hasUnsupportedPictureOptions(
  source: string,
  supportedStyles: ReadonlySet<string>,
): boolean {
  let cursor = 0;
  while (true) {
    const start = source.indexOf("\\begin{tikzpicture}", cursor);
    if (start < 0) return false;
    cursor = skipWhitespace(
      source,
      start + "\\begin{tikzpicture}".length,
    );
    if (source[cursor] !== "[") continue;
    const options = takeBalancedDelimited(source, cursor, "[", "]");
    if (!options) return true;
    for (const raw of splitTopLevel(options.content, ",")) {
      const option = raw.trim();
      if (
        !option ||
        /^(?:thin|thick|very thick|line cap=round|line join=round)$/.test(
          option,
        ) ||
        /^scale\s*=\s*(?:\d+(?:\.\d*)?|\.\d+)$/.test(option) ||
        /^>=\s*stealth$/.test(option) ||
        /^[xy]\s*=\s*1(?:\.0+)?cm$/.test(option) ||
        isSupportedEveryNodeStyle(option) ||
        [...supportedStyles].some((name) =>
          option.startsWith(`${name}/.style=`),
        )
      ) {
        continue;
      }
      return true;
    }
    cursor = options.end;
  }
}

function hasUnsupportedPathOptions(
  source: string,
  supportedStyles: ReadonlySet<string>,
): boolean {
  for (const match of source.matchAll(
    /\\(?:draw|fill|filldraw)\s*\[([^\]]*)\]/g,
  )) {
    for (const raw of splitTopLevel(match[1], ",")) {
      const option = raw.trim();
      if (
        !option ||
        supportedStyles.has(option) ||
        /^(?:->|<-|<->|thin|thick|very thick|dashed)$/.test(option) ||
        /^shorten\s+(?:>=|<=)\s*[0-9.+-]+(?:cm|mm|pt|in)?$/.test(option) ||
        (
          /^(?:draw|fill)\s*=\s*/.test(option) &&
          isSupportedVectorColor(option.replace(/^[^=]+=/, ""))
        ) ||
        isSupportedVectorColor(option)
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}

function isSupportedVectorColor(value: string): boolean {
  return /^(?:black|white|red|green|blue|cyan|magenta|yellow|gray)(?:!\s*(?:\d+(?:\.\d*)?|\.\d+))?$/.test(
    value.trim(),
  );
}

function hasUnsupportedCustomStyles(
  source: string,
  supportedStyles: ReadonlySet<string>,
): boolean {
  let remaining = source.replace(
    /every\s+node\s*\/\.style\s*=\s*\{[^{}]*\}/g,
    "",
  );
  for (const name of supportedStyles) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    remaining = remaining.replace(
      new RegExp(`${escaped}\\s*\\/\\.style\\s*=\\s*\\{[^{}]*\\}`, "g"),
      "",
    );
  }
  return /\/\.style\b/.test(remaining);
}

function supportedBasicNodeStyles(source: string): Set<string> {
  const result = new Set<string>();
  for (const match of source.matchAll(
    /([A-Za-z][A-Za-z0-9_-]*)\s*\/\.style\s*=\s*\{([^{}]*)\}/g,
  )) {
    const options = splitTopLevel(match[2], ",")
      .map((option) => option.trim())
      .filter(Boolean);
    if (
      options.length > 0 &&
      options.every(isSupportedNodeStyleOption)
    ) {
      result.add(match[1]);
    }
  }
  return result;
}

function isSupportedEveryNodeStyle(option: string): boolean {
  const match = option.match(
    /^every\s+node\s*\/\.style\s*=\s*\{([\s\S]*)\}$/,
  );
  return (
    match !== null &&
    splitTopLevel(match[1], ",")
      .map((value) => value.trim())
      .filter(Boolean)
      .every(isSupportedNodeStyleOption)
  );
}

function isSupportedNodeStyleOption(option: string): boolean {
  return (
    option === "draw" ||
    option === "rounded corners" ||
    /^(?:rounded corners|minimum width|minimum height|text width|inner sep|inner xsep|inner ysep|outer sep)\s*=\s*[0-9.+-]+(?:cm|mm|pt|in)?$/.test(
      option,
    ) ||
    /^align\s*=\s*(?:center|left)$/.test(option) ||
    /^anchor\s*=\s*(?:center|north|south|east|west|north east|north west|south east|south west)$/.test(
      option,
    ) ||
    /^rotate\s*=\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(option) ||
    (
      option.startsWith("fill=") &&
      isSupportedVectorColor(option.slice("fill=".length))
    ) ||
    SUPPORTED_NODE_FONT_RE.test(option)
  );
}

function supportedBasicPathStyles(source: string): Set<string> {
  const definitions = new Map<string, string[]>();
  for (const match of source.matchAll(
    /([A-Za-z][A-Za-z0-9_-]*)\s*\/\.style\s*=\s*\{([^{}]*)\}/g,
  )) {
    definitions.set(
      match[1],
      splitTopLevel(match[2], ",")
        .map((option) => option.trim())
        .filter(Boolean),
    );
  }
  const supported = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, options] of definitions) {
      if (
        !supported.has(name) &&
        options.length > 0 &&
        options.every((option) =>
          supported.has(option) ||
          /^(?:->|<-|<->|thin|thick|very thick|dashed)$/.test(option) ||
          /^shorten\s+(?:>=|<=)\s*[0-9.+-]+(?:cm|mm|pt|in)?$/.test(option) ||
          (
            /^(?:draw|fill)\s*=\s*/.test(option) &&
            isSupportedVectorColor(option.replace(/^[^=]+=/, ""))
          ) ||
          isSupportedVectorColor(option)
        )
      ) {
        supported.add(name);
        changed = true;
      }
    }
  }
  return supported;
}

function hasUnsupportedCycles(source: string): boolean {
  for (const match of source.matchAll(/--\s*cycle/g)) {
    const commandStart = source.lastIndexOf(";", match.index) + 1;
    const command = source.slice(commandStart, match.index);
    if (!command.includes("plot[")) return true;
  }
  return false;
}

function hasUnsupportedEllipses(source: string): boolean {
  const bracketEllipses = source.matchAll(/\bellipse\s*\[([^\]]*)\]/g);
  let supported = 0;
  for (const match of bracketEllipses) {
    supported++;
    const options = optionMap(match[1]);
    if (
      !options.has("x radius") ||
      !options.has("y radius") ||
      !isSimpleNumericExpression(options.get("x radius") ?? "") ||
      !isSimpleNumericExpression(options.get("y radius") ?? "")
    ) {
      return true;
    }
  }
  for (const match of source.matchAll(/\bellipse\s*\(([^()]*)\)/g)) {
    const radii = match[1].split(/\s+and\s+/);
    if (
      radii.length !== 2 ||
      !radii.every((radius) => isSimpleNumericExpression(radius))
    ) {
      return true;
    }
    supported++;
  }
  return countMatches(source, /\bellipse\b/g) !== supported;
}

function hasUnsupportedParametricPlots(source: string): boolean {
  let cursor = 0;
  let plots = 0;
  while (true) {
    const start = source.indexOf("plot[", cursor);
    if (start < 0) break;
    plots++;
    const optionsEnd = source.indexOf("]", start + 5);
    if (optionsEnd < 0) return true;
    const optionSource = source.slice(start + 5, optionsEnd);
    const rawOptions = splitTopLevel(optionSource, ",")
      .map((option) => option.trim())
      .filter(Boolean);
    const options = optionMap(optionSource);
    cursor = skipWhitespace(source, optionsEnd + 1);
    if (source.startsWith("coordinates", cursor)) {
      if (
        !splitTopLevel(optionSource, ",").every(
          (option) => option.trim() === "smooth",
        )
      ) {
        return true;
      }
      cursor = skipWhitespace(source, cursor + "coordinates".length);
      const coordinates = takeBalancedDelimited(source, cursor, "{", "}");
      if (!coordinates || !isBoundedCoordinatePlot(coordinates.content)) {
        return true;
      }
      cursor = coordinates.end;
      continue;
    }
    const domain = options.get("domain")?.split(":");
    const samples = Number.parseInt(options.get("samples") ?? "25", 10);
    if (
      rawOptions.some((option) => {
        const separator = option.indexOf("=");
        if (separator < 0) return true;
        const name = option.slice(0, separator).trim();
        return name !== "domain" && name !== "samples";
      }) ||
      domain?.length !== 2 ||
      !domain.every(isSimpleNumericExpression) ||
      !Number.isInteger(samples) ||
      samples < 2 ||
      samples > 256
    ) {
      return true;
    }
    const coordinate = takeBalancedDelimited(source, cursor, "(", ")");
    if (!coordinate || !isSimpleExpressionCoordinate(coordinate.content)) {
      return true;
    }
    cursor = coordinate.end;
  }
  return plots === 0 && /\bplot\s*\[/.test(source);
}

function isSupportedNodeShift(option: string): boolean {
  return /^(?:xshift|yshift)\s*=\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:cm|mm|pt|in)?$/.test(
    option,
  );
}

function isBoundedCoordinatePlot(source: string): boolean {
  const matches = [...source.matchAll(/\(([^()]*)\)/g)];
  if (matches.length < 2 || matches.length > 512) return false;
  if (source.replace(/\([^()]*\)/g, "").trim()) return false;
  return matches.every((match) => {
    const values = splitTopLevel(match[1], ",");
    return (
      values.length === 2 &&
      values.every((value) => isSimpleNumericExpression(value.trim()))
    );
  });
}

function hasUnsupportedCoordinateExpressions(source: string): boolean {
  let cursor = 0;
  while (true) {
    const start = source.indexOf("({", cursor);
    if (start < 0) return false;
    const coordinate = takeBalancedDelimited(source, start, "(", ")");
    if (!coordinate || !isSimpleExpressionCoordinate(coordinate.content)) {
      return true;
    }
    cursor = coordinate.end;
  }
}

function isSimpleExpressionCoordinate(source: string): boolean {
  const values = splitTopLevel(source, ",");
  if (values.length !== 2) return false;
  return values.every((value) => {
    const expression = value
      .trim()
      .replace(/^\{/, "")
      .replace(/\}$/, "");
    return isSimpleNumericExpression(expression);
  });
}

function optionMap(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const option of splitTopLevel(source, ",")) {
    const separator = option.indexOf("=");
    if (separator < 0) continue;
    result.set(
      option.slice(0, separator).trim(),
      option.slice(separator + 1).trim(),
    );
  }
  return result;
}

function splitTopLevel(source: string, separator: string): string[] {
  const result: string[] = [];
  let start = 0;
  let braces = 0;
  let parentheses = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "{") braces++;
    if (source[index] === "}") braces = Math.max(0, braces - 1);
    if (source[index] === "(") parentheses++;
    if (source[index] === ")") parentheses = Math.max(0, parentheses - 1);
    if (
      source[index] === separator &&
      braces === 0 &&
      parentheses === 0
    ) {
      result.push(source.slice(start, index));
      start = index + 1;
    }
  }
  result.push(source.slice(start));
  return result;
}

function takeBalancedDelimited(
  source: string,
  start: number,
  open: string,
  close: string,
): { content: string; end: number } | null {
  if (source[start] !== open) return null;
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === open) depth++;
    if (source[index] !== close) continue;
    depth--;
    if (depth === 0) {
      return {
        content: source.slice(start + 1, index),
        end: index + 1,
      };
    }
  }
  return null;
}

function hasUnsupportedMacroDefinitions(source: string): boolean {
  if (
    /\\(?:edef|gdef|xdef|let|newcommand|renewcommand|providecommand)\b/.test(
      source,
    )
  ) {
    return true;
  }
  const definitions = source.matchAll(
    /\\def\s*\\[A-Za-z@]+\s*\{([^{}]*)\}/g,
  );
  let supported = 0;
  for (const match of definitions) {
    supported++;
    if (!isSimpleNumericExpression(match[1])) return true;
  }
  return countMatches(source, /\\def\b/g) !== supported;
}

function hasUnsupportedPgfMath(source: string): boolean {
  if (/\\pgfmath(?:parse|truncatemacro)\b/.test(source)) return true;
  const definitions = source.matchAll(
    /\\pgfmathsetmacro\s*\{\s*\\[A-Za-z@]+\s*\}\s*\{([^{}]*)\}/g,
  );
  let supported = 0;
  for (const match of definitions) {
    supported++;
    if (!isSimpleNumericExpression(match[1])) return true;
  }
  return countMatches(source, /\\pgfmathsetmacro\b/g) !== supported;
}

function isSimpleNumericExpression(value: string): boolean {
  return (
    value.trim().length > 0 &&
    /^[\s0-9A-Za-z@\\.+*/^()-]+$/.test(value) &&
    !/\\(?:input|csname|expandafter|the)\b/.test(value)
  );
}

function hasOnlySimpleForeachLoops(source: string): boolean {
  let cursor = 0;
  let loops = 0;
  while (true) {
    const start = source.indexOf("\\foreach", cursor);
    if (start < 0) break;
    loops++;
    cursor = start + "\\foreach".length;
    cursor = skipWhitespace(source, cursor);
    const variable = /^\\[A-Za-z@]+/.exec(source.slice(cursor));
    if (!variable) return false;
    cursor += variable[0].length;
    cursor = skipWhitespace(source, cursor);
    if (!source.startsWith("in", cursor)) return false;
    cursor += 2;
    cursor = skipWhitespace(source, cursor);
    const values = takeBalancedGroup(source, cursor);
    if (!values || !isSimpleForeachValues(values.content)) return false;
    cursor = skipWhitespace(source, values.end);
    const body = takeBalancedGroup(source, cursor);
    if (!body) return false;
    cursor = body.end;
  }
  return loops > 0;
}

function isSimpleForeachValues(value: string): boolean {
  const items = value.split(",").map((item) => item.trim());
  if (items.length === 0 || items.length > 256) return false;
  const ellipsis = items
    .map((item, index) => (item === "..." ? index : -1))
    .filter((index) => index >= 0);
  if (ellipsis.length === 0) return items.every(isSimpleForeachAtom);
  const index = ellipsis[0];
  return (
    ellipsis.length === 1 &&
    (index === 1 || index === 2) &&
    index + 1 === items.length - 1 &&
    items.filter((_, itemIndex) => itemIndex !== index).every(isSimpleForeachAtom)
  );
}

function isSimpleForeachAtom(value: string): boolean {
  return (
    value.length > 0 &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+|\\[A-Za-z@]+)$/.test(value)
  );
}

function takeBalancedGroup(
  source: string,
  start: number,
): { content: string; end: number } | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] !== "}") continue;
    depth--;
    if (depth === 0) {
      return {
        content: source.slice(start + 1, index),
        end: index + 1,
      };
    }
  }
  return null;
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
  return cursor;
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

function stripTikzComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      for (let index = 0; index < line.length; index++) {
        if (line[index] !== "%") continue;
        let backslashes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor--) {
          backslashes++;
        }
        if (backslashes % 2 === 0) return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}
