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
  /\\(?:clip|graph|matrix|path|pattern|pic|shade|shadedraw|useasboundingbox)\b/;

const PATH_STYLE_RE =
  /^(?:->|<-|<->|ultra thin|very thin|thin|semithick|thick|very thick|ultra thick|dashed|densely dashed|loosely dashed|dotted|densely dotted|loosely dotted|help lines)$/;

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
    /(?:\bto\s*\[|\bdecorate\b|\bparabola\b|\.\.\s*node\b|\)\s*(?:\|-|-\|)\s*\()/.test(
      content,
    ) ||
    hasUnsupportedPathSemantics(content) ||
    hasUnsupportedArcs(content) ||
    hasUnsupportedCircles(content)
  ) {
    features.add("advanced-path");
  }
  if (
    UNSUPPORTED_COMMAND_RE.test(content) ||
    hasUnsupportedEnvironments(content) ||
    !hasOnlySupportedShiftScopes(content) ||
    hasUnsupportedCoordinateCommands(content) ||
    (content.includes("\\foreach") && !hasOnlySimpleForeachLoops(content))
  ) {
    features.add("unsupported-command");
  }
  if (hasUnsupportedRotatedNodeConnectors(content)) {
    features.add("advanced-node");
  }

  for (const match of content.matchAll(/(\\node|\bnode)\s*\[([^\]]+)\]/g)) {
    const inline = match[1] === "node";
    const options = match[2]
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    if (
      inline &&
      options.includes("sloped") &&
      options.some((option) => /^rotate\s*=/.test(option))
    ) {
      features.add("advanced-node");
    }
    if (
      options.some(
        (option) =>
          !isSupportedNodeStyleOption(option) &&
          !isSupportedNodeShift(option) &&
          !isSupportedNodePlacement(option) &&
          !(inline && isSupportedPathNodeOption(option)) &&
          !supportedNodeStyles.has(option),
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

function hasUnsupportedRotatedNodeConnectors(source: string): boolean {
  if (!/\brotate\s*=\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)/.test(source)) {
    return false;
  }
  return /\\(?:draw|fill|filldraw)\b[\s\S]*?\(\s*[A-Za-z@][A-Za-z0-9_:@-]*(?:\.(?:north|south|east|west|center))?\s*\)[\s\S]*?;/.test(
    source,
  );
}

function hasUnsupportedCoordinateCommands(source: string): boolean {
  let supported = 0;
  for (const match of source.matchAll(
    /\\coordinate\s*\([A-Za-z@][A-Za-z0-9_:@-]*\)\s*at\s*\(([^()]*)\)/g,
  )) {
    supported++;
    const value = match[1].trim();
    const components = splitTopLevel(value, ",");
    if (
      components.length === 2 &&
      components.every((component) =>
        isSimpleNumericExpression(component.trim())
      )
    ) {
      continue;
    }
    const polar = splitTopLevel(value, ":");
    if (
      polar.length !== 2 ||
      !polar.every((component) =>
        /^(?:up|down|left|right)$/.test(component.trim()) ||
        isSimpleNumericExpression(component.trim())
      )
    ) {
      return true;
    }
  }
  return countMatches(source, /\\coordinate\b/g) !== supported;
}

function hasUnsupportedArcs(source: string): boolean {
  for (const match of source.matchAll(/\barc\s*([([])/g)) {
    const open = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(open);
    const close = open === "[" ? "]" : ")";
    const body = takeBalancedDelimited(source, start, open, close);
    if (!body) return true;
    if (open === "(") {
      const values = splitTopLevel(body.content, ":").map((value) =>
        value.trim()
      );
      if (
        values.length !== 3 ||
        !values.every(isSimpleNumericExpression)
      ) {
        return true;
      }
      continue;
    }
    const options = optionMap(body.content);
    if (
      options.size !== 3 ||
      !["start angle", "end angle", "radius"].every((name) =>
        options.has(name)
      ) ||
      ![...options.values()].every(isSimpleNumericExpression)
    ) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedCircles(source: string): boolean {
  for (const match of source.matchAll(/\bcircle\s*([([])/g)) {
    const open = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(open);
    const close = open === "[" ? "]" : ")";
    const body = takeBalancedDelimited(source, start, open, close);
    if (!body) return true;
    if (open === "(") {
      if (!isSimpleNumericExpression(body.content)) return true;
      continue;
    }
    const options = optionMap(body.content);
    if (
      options.size !== 1 ||
      !options.has("radius") ||
      !isSimpleNumericExpression(options.get("radius") ?? "")
    ) {
      return true;
    }
  }
  return false;
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
        /^(?:ultra thin|very thin|thin|semithick|thick|very thick|ultra thick|line cap=round|line join=round)$/.test(
          option,
        ) ||
        /^scale\s*=\s*(?:\d+(?:\.\d*)?|\.\d+)$/.test(option) ||
        /^>=\s*(?:stealth|Stealth|latex|Latex)$/.test(option) ||
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
    /\\(?:draw|fill|filldraw)\s*\[([^\]]*)\]([\s\S]*?);/g,
  )) {
    for (const raw of splitTopLevel(match[1], ",")) {
      const option = raw.trim();
      if (
        !option ||
        supportedStyles.has(option) ||
        (PATH_STYLE_RE.test(option) || isSupportedArrowStyle(option)) ||
        (
          option === "smooth" &&
          /\bplot(?:\s*\[[^\]]*\])?\s+coordinates\b/.test(match[2])
        ) ||
        /^(?:line width|step|xstep|ystep)\s*=\s*[0-9.+-]+(?:cm|mm|pt|bp|in)?$/.test(
          option,
        ) ||
        /^(?:opacity|draw opacity|fill opacity)\s*=\s*(?:0(?:\.\d*)?|1(?:\.0*)?|\.\d+)$/.test(
          option,
        ) ||
        /^shorten\s+(?:>=|<=)\s*[0-9.+-]+(?:cm|mm|pt|bp|in)?$/.test(option) ||
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

function hasUnsupportedPathSemantics(source: string): boolean {
  for (const match of source.matchAll(
    /\\(?:draw|fill|filldraw)\b([\s\S]*?);/g,
  )) {
    const path = match[1];
    const curved =
      /\barc\s*(?:\[|\()/.test(path) ||
      /\.\.\s*controls\b/.test(path) ||
      /\bplot\b/.test(path);
    if (curved && /\bnode(?:\s*\[|\s*\{)/.test(path)) return true;
    if (curved && /\bshorten\s+(?:>=|<=)/.test(path)) return true;
    if (
      /\bsmooth\b/.test(path) &&
      !/\bplot(?:\s*\[[^\]]*\])?\s+coordinates\b/.test(path)
    ) {
      return true;
    }
  }
  return false;
}

function isSupportedVectorColor(value: string): boolean {
  return /^(?:black|white|red|green|blue|cyan|magenta|yellow|gray|orange|violet|purple|brown|lime|teal|pink)(?:!\s*(?:\d+(?:\.\d*)?|\.\d+))?$/.test(
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
    option === "circle" ||
    option === "rounded corners" ||
    /^(?:rounded corners|minimum width|minimum height|text width|inner sep|inner xsep|inner ysep|outer sep)\s*=\s*[0-9.+-]+(?:cm|mm|pt|bp|in)?$/.test(
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
          PATH_STYLE_RE.test(option) ||
          isSupportedArrowStyle(option) ||
          /^(?:line width|step|xstep|ystep)\s*=\s*[0-9.+-]+(?:cm|mm|pt|bp|in)?$/.test(
            option,
          ) ||
          /^(?:opacity|draw opacity|fill opacity)\s*=\s*(?:0(?:\.\d*)?|1(?:\.0*)?|\.\d+)$/.test(
            option,
          ) ||
          /^shorten\s+(?:>=|<=)\s*[0-9.+-]+(?:cm|mm|pt|bp|in)?$/.test(option) ||
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

function isSupportedArrowStyle(option: string): boolean {
  const parseTip = (value: string): string | null => {
    const match = value.match(/^\{?(Stealth|stealth|Latex|latex)\}?$/);
    if (!match) return null;
    if (value.startsWith("{") !== value.endsWith("}")) return null;
    return match[1].toLowerCase();
  };
  if (option.startsWith("-")) return parseTip(option.slice(1)) !== null;
  if (option.endsWith("-")) return parseTip(option.slice(0, -1)) !== null;
  const separator = option.indexOf("-");
  if (separator < 0 || separator !== option.lastIndexOf("-")) return false;
  const start = parseTip(option.slice(0, separator));
  const end = parseTip(option.slice(separator + 1));
  return start !== null && start === end;
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

function hasUnsupportedEnvironments(source: string): boolean {
  return /\\begin\s*\{\s*(?:axis|semilogxaxis|semilogyaxis|loglogaxis|circuitikz|pgfonlayer|matrix)\s*\}/.test(
    source,
  );
}

function hasOnlySupportedShiftScopes(source: string): boolean {
  const tokenPattern = /\\(begin|end)\s*\{\s*scope\s*\}/g;
  const shifts = [{ x: 0, y: 0 }];
  for (const match of source.matchAll(tokenPattern)) {
    if (match[1] === "end") {
      if (shifts.length === 1) return false;
      shifts.pop();
      continue;
    }
    const cursor = skipWhitespace(
      source,
      (match.index ?? 0) + match[0].length,
    );
    const parent = shifts[shifts.length - 1];
    if (source[cursor] !== "[") {
      shifts.push(parent);
      continue;
    }
    const options = takeBalancedDelimited(source, cursor, "[", "]");
    if (!options) return false;
    const entries = splitTopLevel(options.content, ",")
      .map((option) => option.trim())
      .filter(Boolean);
    if (entries.length !== 1) {
      return false;
    }
    const local = parseSupportedScopeShift(entries[0]);
    if (!local) return false;
    const combined = {
      x: parent.x + local.x,
      y: parent.y + local.y,
    };
    if (
      Math.abs(combined.x) > MAX_SUPPORTED_SCOPE_SHIFT_BP ||
      Math.abs(combined.y) > MAX_SUPPORTED_SCOPE_SHIFT_BP
    ) {
      return false;
    }
    shifts.push(combined);
  }
  return shifts.length === 1;
}

const BP_PER_CM = 72 / 2.54;
const MAX_SUPPORTED_SCOPE_SHIFT_BP = 1000 * BP_PER_CM;

function parseSupportedScopeShift(
  option: string,
): { x: number; y: number } | null {
  const match = option.match(
    /^shift\s*=\s*\{\s*\(\s*([^,{}]+)\s*,\s*([^,{}]+)\s*\)\s*\}$/,
  );
  if (!match) return null;
  const x = parseSupportedScopeShiftLength(match[1]);
  const y = parseSupportedScopeShiftLength(match[2]);
  return x === null || y === null ? null : { x, y };
}

function parseSupportedScopeShiftLength(value: string): number | null {
  const match = value
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(cm|mm|pt|bp|in)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  let scale = BP_PER_CM;
  if (match[2] === "mm") scale = BP_PER_CM / 10;
  if (match[2] === "pt") scale = 72 / 72.27;
  if (match[2] === "bp") scale = 1;
  if (match[2] === "in") scale = 72;
  const result = number * scale;
  return Number.isFinite(result) ? result : null;
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
  return /^(?:xshift|yshift)\s*=\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:cm|mm|pt|bp|in)?$/.test(
    option,
  );
}

function isSupportedNodePlacement(option: string): boolean {
  return /^(?:above|below|left|right|above left|left above|above right|right above|below left|left below|below right|right below)(?:\s*=\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:cm|mm|pt|bp|in)?)?$/.test(
    option,
  );
}

function isSupportedPathNodeOption(option: string): boolean {
  return /^(?:sloped|at start|very near start|near start|midway|near end|very near end|at end|pos\s*=\s*(?:0(?:\.\d*)?|1(?:\.0*)?|\.\d+))$/.test(
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
  if (
    /\(\s*\$/.test(source) ||
    /\([^()]*(?:,[^()]*){2,}\)/.test(source)
  ) {
    return true;
  }
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
    const variables = /^\\[A-Za-z@]+(?:\s*\/\s*\\[A-Za-z@]+)*/.exec(
      source.slice(cursor),
    );
    if (!variables) return false;
    const variableCount = variables[0].split("/").length;
    cursor += variables[0].length;
    cursor = skipWhitespace(source, cursor);
    if (!source.startsWith("in", cursor)) return false;
    cursor += 2;
    cursor = skipWhitespace(source, cursor);
    const values = takeBalancedGroup(source, cursor);
    if (
      !values ||
      !isSimpleForeachValues(values.content, variableCount)
    ) {
      return false;
    }
    cursor = skipWhitespace(source, values.end);
    const body = takeBalancedGroup(source, cursor);
    if (!body) return false;
    cursor = body.end;
  }
  return loops > 0;
}

function isSimpleForeachValues(value: string, variableCount: number): boolean {
  const items = value.split(",").map((item) => item.trim());
  if (items.length === 0 || items.length > 256) return false;
  const ellipsis = items
    .map((item, index) => (item === "..." ? index : -1))
    .filter((index) => index >= 0);
  if (ellipsis.length === 0) {
    return items.every((item) => {
      const values = item.split("/").map((part) => part.trim());
      return (
        values.length === variableCount &&
        values.every(isSimpleForeachAtom)
      );
    });
  }
  if (variableCount !== 1) return false;
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
