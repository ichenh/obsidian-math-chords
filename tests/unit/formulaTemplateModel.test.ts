import { describe, expect, it } from "vitest";
import {
  areAllFormulaTemplateNodesCollapsed,
  appendFormulaTemplate,
  appendFormulaTemplateFolder,
  createFormulaTemplate,
  createFormulaTemplateFolder,
  flattenFormulaTemplates,
  formulaTemplateLabel,
  moveFormulaTemplateNode,
  normalizeFormulaTemplateNodes,
  recordRecentFormulaTemplate,
  removeFormulaTemplateNode,
  setAllFormulaTemplateNodesCollapsed,
  updateFormulaTemplateNode,
} from "../../src/formulaTemplateModel";
import type { FormulaTemplateFolder, FormulaTemplateNode } from "../../src/types";

function ids(...values: string[]): () => string {
  return () => {
    const value = values.shift();
    if (!value) throw new Error("Test ID factory exhausted");
    return value;
  };
}

describe("formula template model", () => {
  it("creates an empty folder", () => {
    expect(createFormulaTemplateFolder(" Maxwell ", ids("folder"))).toEqual({
      id: "folder",
      type: "folder",
      name: "Maxwell",
      collapsed: false,
      children: [],
    });
  });

  it("normalizes recursive persisted data and preserves empty folders", () => {
    const normalized = normalizeFormulaTemplateNodes([
      {
        id: "folder",
        type: "folder",
        name: " Physics ",
        children: [],
      },
      { id: "folder", type: "template", content: 42, collapsed: true },
      { type: "unknown" },
    ], ids("replacement"));

    expect(normalized).toEqual([
      {
        id: "folder",
        type: "folder",
        name: "Physics",
        collapsed: false,
        children: [],
      },
      {
        id: "replacement",
        type: "template",
        name: "",
        content: "",
        collapsed: true,
        favorite: false,
      },
    ]);
  });

  it("adds nested folders and edits template content immutably", () => {
    const root = createFormulaTemplateFolder("Root", ids("root"));
    const child = createFormulaTemplateFolder("Child", ids("child"));
    const nested = appendFormulaTemplateFolder([root], root.id, child);
    const withTemplate = appendFormulaTemplate(
      nested,
      child.id,
      createFormulaTemplate(ids("child-template")),
    );
    const edited = updateFormulaTemplateNode(withTemplate, "child-template", (node) => ({
      ...node,
      content: "$$\\nabla \\cdot \\mathbf{E}=\\rho/\\varepsilon_0$$",
    }) as FormulaTemplateNode);

    expect(root.children).toHaveLength(0);
    expect((nested[0] as FormulaTemplateFolder).children).toHaveLength(1);
    expect(
      ((edited[0] as FormulaTemplateFolder).children[0] as FormulaTemplateFolder)
        .children[0],
    ).toMatchObject({ content: "$$\\nabla \\cdot \\mathbf{E}=\\rho/\\varepsilon_0$$" });
  });

  it("adds templates directly at the root or inside a folder", () => {
    const rootTemplate = {
      ...createFormulaTemplate(ids("root-template")),
      name: "Root equation",
    };
    const roots = appendFormulaTemplate([], null, rootTemplate);
    expect(roots).toEqual([rootTemplate]);

    const folder = createFormulaTemplateFolder("Folder", ids("folder"));
    const nestedTemplate = {
      ...createFormulaTemplate(ids("nested-template")),
      name: "Nested equation",
    };
    const nested = appendFormulaTemplate([folder], folder.id, nestedTemplate);
    expect((nested[0] as FormulaTemplateFolder).children.map((node) => node.id)).toEqual([
      "nested-template",
    ]);
  });

  it("moves templates between levels and leaves the source folder empty", () => {
    const source = createFormulaTemplateFolder("Source", ids("source"));
    const target = createFormulaTemplateFolder("Target", ids("target"));
    const tree = appendFormulaTemplate(
      appendFormulaTemplate([source, target], source.id, {
        ...createFormulaTemplate(ids("source-template")),
        name: "Source template",
      }),
      target.id,
      { ...createFormulaTemplate(ids("target-template")), name: "Target template" },
    );
    const moved = moveFormulaTemplateNode(
      tree,
      "source-template",
      "target",
      1,
    );

    expect((moved[0] as FormulaTemplateFolder).children).toEqual([]);
    expect((moved[1] as FormulaTemplateFolder).children.map((node) => node.id)).toEqual([
      "target-template",
      "source-template",
    ]);
  });

  it("reorders root nodes and moves a template into an empty folder", () => {
    const first = { ...createFormulaTemplate(ids("first")), name: "First" };
    const second = { ...createFormulaTemplate(ids("second")), name: "Second" };
    const folder = createFormulaTemplateFolder("Empty", ids("folder"));
    const reordered = moveFormulaTemplateNode([first, second, folder], "second", null, 0);

    expect(reordered.map((node) => node.id)).toEqual(["second", "first", "folder"]);
    const nested = moveFormulaTemplateNode(reordered, "first", "folder", 0);
    expect(nested.map((node) => node.id)).toEqual(["second", "folder"]);
    expect((nested[1] as FormulaTemplateFolder).children.map((node) => node.id))
      .toEqual(["first"]);
  });

  it("does not move a folder inside one of its descendants", () => {
    const root = createFormulaTemplateFolder("Root", ids("root"));
    const child = createFormulaTemplateFolder("Child", ids("child"));
    const tree = appendFormulaTemplateFolder([root], root.id, child);
    expect(moveFormulaTemplateNode(tree, "root", "child", 0)).toBe(tree);
  });

  it("derives a compact label from the first Markdown content line", () => {
    expect(formulaTemplateLabel("\n## Maxwell equations\n$$E=mc^2$$", "Untitled"))
      .toBe("Maxwell equations");
    expect(formulaTemplateLabel("  ", "Untitled")).toBe("Untitled");
  });

  it("migrates a legacy template title from its Markdown content", () => {
    expect(normalizeFormulaTemplateNodes([{
      id: "template",
      type: "template",
      content: "## Maxwell equations\n$$E=mc^2$$",
    }])).toEqual([expect.objectContaining({ name: "Maxwell equations" })]);
  });

  it("normalizes favorites and flattens templates in tree order", () => {
    const normalized = normalizeFormulaTemplateNodes([
      {
        id: "root",
        type: "template",
        name: "Root",
        content: "$x$",
        favorite: true,
      },
      {
        id: "folder",
        type: "folder",
        name: "Folder",
        children: [
          {
            id: "nested",
            type: "template",
            name: "Nested",
            content: "$y$",
          },
        ],
      },
    ]);

    expect(
      flattenFormulaTemplates(normalized).map((template) => [
        template.id,
        template.favorite,
      ]),
    ).toEqual([
      ["root", true],
      ["nested", false],
    ]);
  });

  it("moves a used template to the front and bounds recent history", () => {
    expect(recordRecentFormulaTemplate(["b", "a", "c"], "a", 3)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(recordRecentFormulaTemplate(["b", "c", "d"], "a", 3)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("leaves a folder empty after its last template is deleted", () => {
    const folder = createFormulaTemplateFolder("Folder", ids("folder"));
    const withTemplate = appendFormulaTemplate(
      [folder],
      folder.id,
      createFormulaTemplate(ids("template")),
    );
    const next = removeFormulaTemplateNode(withTemplate, "template");
    expect((next[0] as FormulaTemplateFolder).children).toEqual([]);
  });

  it("collapses and expands every folder and template as one panel action", () => {
    const root = createFormulaTemplateFolder("Root", ids("root"));
    const nested = createFormulaTemplateFolder("Nested", ids("nested"));
    const tree = appendFormulaTemplateFolder([root], root.id, nested);
    expect(areAllFormulaTemplateNodesCollapsed(tree)).toBe(false);

    const collapsed = setAllFormulaTemplateNodesCollapsed(tree, true);
    expect(areAllFormulaTemplateNodesCollapsed(collapsed)).toBe(true);
    expect(areAllFormulaTemplateNodesCollapsed(
      setAllFormulaTemplateNodesCollapsed(collapsed, false),
    )).toBe(false);
    expect(areAllFormulaTemplateNodesCollapsed([])).toBe(false);
  });
});
