import { describe, expect, it } from "vitest";
import {
  applyDelimiterChanges,
  convertPastedLatexDelimiters,
  findLatexDelimiterConversions,
  findLatexDelimiterConversionsInRanges,
} from "../../src/delimiterConverter";

function convert(markdown: string, from = 0, to = markdown.length) {
  const result = findLatexDelimiterConversions(markdown, from, to);
  return { ...result, text: applyDelimiterChanges(markdown, result.changes) };
}

describe("LaTeX delimiter conversion", () => {
  it("converts display and inline pairs without changing their contents", () => {
    const input = "Einstein showed that\n\n\\[\nE = mc^2\n\\]\n\nwhere \\(m\\) is the mass.";
    const result = convert(input);

    expect(result.text).toBe(
      "Einstein showed that\n\n$$\nE = mc^2\n$$\n\nwhere $m$ is the mass.",
    );
    expect(result.displayCount).toBe(1);
    expect(result.inlineCount).toBe(1);
  });

  it("leaves fenced code, inline code, frontmatter, and HTML code blocks untouched", () => {
    const input = [
      "---",
      "formula: \\\\(yaml\\\\)",
      "---",
      "```latex",
      "\\[fence\\]",
      "```",
      "Text `\\(inline code\\)`.",
      "<pre>\\[pre\\]</pre>",
      "<code class=\"x\">\\(code\\)</code>",
      "Text \\(convert\\).",
    ].join("\n");

    const result = convert(input);
    expect(result.text).toBe(input.replace("\\(convert\\)", "$convert$"));
    expect(result.displayCount).toBe(0);
    expect(result.inlineCount).toBe(1);
  });

  it("does not convert inside existing Markdown math", () => {
    const input = "$x + \\(y\\)$ and $$\\[z\\]$$ and \\(outside\\)";
    const result = convert(input);
    expect(result.text).toBe("$x + \\(y\\)$ and $$\\[z\\]$$ and $outside$");
    expect(result.inlineCount).toBe(1);
  });

  it("uses full-document context when converting a selection", () => {
    const input = "```latex\n\\(protected\\)\n```\n\\(selected\\)";
    const protectedFrom = input.indexOf("\\(protected");
    const protectedTo = protectedFrom + "\\(protected\\)".length;
    expect(convert(input, protectedFrom, protectedTo).text).toBe(input);

    const selectedFrom = input.indexOf("\\(selected");
    const selectedTo = selectedFrom + "\\(selected\\)".length;
    expect(convert(input, selectedFrom, selectedTo).text).toBe(
      input.replace("\\(selected\\)", "$selected$"),
    );
  });

  it("only converts complete pairs wholly contained in the requested range", () => {
    const input = "before \\(x\\) after";
    const from = input.indexOf("x");
    const to = from + 1;
    expect(convert(input, from, to).text).toBe(input);
  });

  it("preserves unmatched and escaped delimiter-like text", () => {
    expect(convert("unmatched \\(x").text).toBe("unmatched \\(x");

    const input = "escaped \\\\(y\\\\) and \\(ok\\)";
    const result = convert(input);
    expect(result.text).toBe("escaped \\\\(y\\\\) and $ok$");
    expect(result.inlineCount).toBe(1);
  });

  it("does not pair inline delimiters across a line break", () => {
    const input = "\\(first\nsecond\\)";
    expect(convert(input).text).toBe(input);
  });

  it("does not mistake currency for existing Markdown math", () => {
    const input = "Price $5 and \\(x\\) and $10.";
    expect(convert(input).text).toBe("Price $5 and $x$ and $10.");
  });

  it("protects unclosed HTML pre and code blocks through end of document", () => {
    expect(convert("<pre>\\(x\\)").text).toBe("<pre>\\(x\\)");
    expect(convert("<code data-value=\">\">\\[x\\]").text).toBe(
      "<code data-value=\">\">\\[x\\]",
    );
  });

  it("protects tilde fences and ignores HTML-looking text inside fences", () => {
    const input = "~~~html\n<pre>\\(x\\)\n~~~\n\\(outside\\)";
    expect(convert(input).text).toBe("~~~html\n<pre>\\(x\\)\n~~~\n$outside$");
  });

  it("ignores code-tag text inside HTML comments", () => {
    const input = "<!-- <pre> \\(comment\\) --> \\(outside\\)";
    expect(convert(input).text).toBe("<!-- <pre> \\(comment\\) --> $outside$");
  });

  it("does not treat an invalid backtick fence as a code block", () => {
    const input = "```bad`info\n\\(normal text\\)";
    expect(convert(input).text).toBe("```bad`info\n$normal text$");
  });

  it("does not let an HTML comment inside a fence protect following text", () => {
    const input = "```html\n<!-- \\(code\\)\n```\n\\(outside\\)";
    expect(convert(input).text).toBe("```html\n<!-- \\(code\\)\n```\n$outside$");
  });

  it("does not treat an HTML tag inside inline code as a real block", () => {
    const input = "`<pre>` \\(outside\\)";
    expect(convert(input).text).toBe("`<pre>` $outside$");
  });

  it("does not treat an HTML comment marker inside inline code as a comment", () => {
    const input = "`<!--` \\(outside\\)";
    expect(convert(input).text).toBe("`<!--` $outside$");
  });

  it("converts every non-empty selection in one combined result", () => {
    const input = "\\(first\\) middle \\[second\\]";
    const secondFrom = input.indexOf("\\[");
    const result = findLatexDelimiterConversionsInRanges(input, [
      { from: 0, to: "\\(first\\)".length },
      { from: input.indexOf("middle"), to: input.indexOf("middle") },
      { from: secondFrom, to: input.length },
    ]);
    expect(applyDelimiterChanges(input, result.changes)).toBe("$first$ middle $$second$$");
    expect([result.displayCount, result.inlineCount]).toEqual([1, 1]);
  });

  it("does not double-count formulas in overlapping ranges", () => {
    const input = "before \\(x\\) after";
    const result = findLatexDelimiterConversionsInRanges(input, [
      { from: 0, to: input.length },
      { from: input.indexOf("\\("), to: input.indexOf("\\)") + 2 },
    ]);

    expect(applyDelimiterChanges(input, result.changes)).toBe("before $x$ after");
    expect(result.inlineCount).toBe(1);
    expect(result.displayCount).toBe(0);
  });

  it("does not join adjacent selections into a complete delimiter pair", () => {
    const input = "\\(split\\)";
    const middle = input.indexOf("\\)");
    const result = findLatexDelimiterConversionsInRanges(input, [
      { from: 0, to: middle },
      { from: middle, to: input.length },
    ]);

    expect(result.changes).toEqual([]);
  });

  it("uses surrounding Markdown context for paste conversion", () => {
    const code = "```latex\nplaceholder\n```";
    const codeAt = code.indexOf("placeholder");
    expect(
      convertPastedLatexDelimiters(code, "\\(x\\)", codeAt, codeAt + "placeholder".length),
    ).toBeNull();

    const text = "before placeholder after";
    const textAt = text.indexOf("placeholder");
    expect(
      convertPastedLatexDelimiters(text, "\\(x\\)", textAt, textAt + "placeholder".length),
    ).toBe("$x$");
  });

  it("skips pasted text without a possible opening delimiter", () => {
    expect(convertPastedLatexDelimiters("before after", "plain text", 7, 7)).toBeNull();
    expect(convertPastedLatexDelimiters("before after", "\\) only", 7, 7)).toBeNull();
  });
});
