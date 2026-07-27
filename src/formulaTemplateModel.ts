import type {
  FormulaTemplate,
  FormulaTemplateFolder,
  FormulaTemplateNode,
} from "./types";

export type FormulaTemplateIdFactory = () => string;

function defaultIdFactory(): string {
  return `template-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFormulaTemplate(
  idFactory: FormulaTemplateIdFactory = defaultIdFactory,
): FormulaTemplate {
  return {
    id: idFactory(),
    type: "template",
    name: "",
    content: "",
    collapsed: false,
    favorite: false,
  };
}

export function createFormulaTemplateFolder(
  name: string,
  idFactory: FormulaTemplateIdFactory = defaultIdFactory,
): FormulaTemplateFolder {
  return {
    id: idFactory(),
    type: "folder",
    name: name.trim(),
    collapsed: false,
    children: [],
  };
}

export function cloneFormulaTemplateNodes(
  nodes: FormulaTemplateNode[],
): FormulaTemplateNode[] {
  return nodes.map((node) =>
    node.type === "folder"
      ? { ...node, children: cloneFormulaTemplateNodes(node.children) }
      : { ...node },
  );
}

export function areAllFormulaTemplateNodesCollapsed(
  nodes: FormulaTemplateNode[],
): boolean {
  let found = false;
  const visit = (entries: FormulaTemplateNode[]): boolean => entries.every((node) => {
    found = true;
    return node.collapsed && (node.type !== "folder" || visit(node.children));
  });
  return visit(nodes) && found;
}

export function setAllFormulaTemplateNodesCollapsed(
  nodes: FormulaTemplateNode[],
  collapsed: boolean,
): FormulaTemplateNode[] {
  return nodes.map((node) => node.type === "folder"
    ? {
        ...node,
        collapsed,
        children: setAllFormulaTemplateNodesCollapsed(node.children, collapsed),
      }
    : { ...node, collapsed });
}

export function normalizeFormulaTemplateNodes(
  raw: unknown,
  idFactory: FormulaTemplateIdFactory = defaultIdFactory,
): FormulaTemplateNode[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();

  const normalizeId = (value: unknown): string => {
    const candidate = typeof value === "string" ? value.trim() : "";
    if (candidate && !ids.has(candidate)) {
      ids.add(candidate);
      return candidate;
    }
    let generated = idFactory();
    while (!generated || ids.has(generated)) generated = idFactory();
    ids.add(generated);
    return generated;
  };

  const normalizeNode = (value: unknown): FormulaTemplateNode | null => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.type === "template") {
      return {
        id: normalizeId(record.id),
        type: "template",
        name: typeof record.name === "string"
          ? record.name.trim()
          : formulaTemplateLabel(
              typeof record.content === "string" ? record.content : "",
              "",
            ),
        content: typeof record.content === "string" ? record.content : "",
        collapsed: record.collapsed === true,
        favorite: record.favorite === true,
      };
    }
    if (record.type !== "folder") return null;
    const id = normalizeId(record.id);
    const children = Array.isArray(record.children)
      ? record.children
          .map((child) => normalizeNode(child))
          .filter((child): child is FormulaTemplateNode => child !== null)
      : [];
    return {
      id,
      type: "folder",
      name: typeof record.name === "string" ? record.name.trim() : "",
      collapsed: record.collapsed === true,
      children,
    };
  };

  return raw
    .map((entry) => normalizeNode(entry))
    .filter((entry): entry is FormulaTemplateNode => entry !== null);
}

export function flattenFormulaTemplates(
  nodes: readonly FormulaTemplateNode[],
): FormulaTemplate[] {
  const templates: FormulaTemplate[] = [];
  const visit = (entries: readonly FormulaTemplateNode[]): void => {
    for (const node of entries) {
      if (node.type === "template") templates.push(node);
      else visit(node.children);
    }
  };
  visit(nodes);
  return templates;
}

export function recordRecentFormulaTemplate(
  recentIds: readonly string[],
  templateId: string,
  limit = 12,
): string[] {
  const normalizedId = templateId.trim();
  if (!normalizedId || limit <= 0) return [];
  return [
    normalizedId,
    ...recentIds.filter((id) => id !== normalizedId),
  ].slice(0, limit);
}

export function appendFormulaTemplateFolder(
  roots: FormulaTemplateNode[],
  parentId: string | null,
  folder: FormulaTemplateFolder,
): FormulaTemplateNode[] {
  return appendFormulaTemplateNode(roots, parentId, folder);
}

export function appendFormulaTemplate(
  roots: FormulaTemplateNode[],
  parentId: string | null,
  template: FormulaTemplate,
): FormulaTemplateNode[] {
  return appendFormulaTemplateNode(roots, parentId, template);
}

function appendFormulaTemplateNode(
  roots: FormulaTemplateNode[],
  parentId: string | null,
  appended: FormulaTemplateNode,
): FormulaTemplateNode[] {
  if (parentId === null) return [...cloneFormulaTemplateNodes(roots), appended];
  let changed = false;
  const visit = (nodes: FormulaTemplateNode[]): FormulaTemplateNode[] =>
    nodes.map((node) => {
      if (node.type !== "folder") return { ...node };
      if (node.id === parentId) {
        changed = true;
        return { ...node, children: [...cloneFormulaTemplateNodes(node.children), appended] };
      }
      return { ...node, children: visit(node.children) };
    });
  const next = visit(roots);
  return changed ? next : roots;
}

export function updateFormulaTemplateNode(
  roots: FormulaTemplateNode[],
  nodeId: string,
  update: (node: FormulaTemplateNode) => FormulaTemplateNode,
): FormulaTemplateNode[] {
  let changed = false;
  const visit = (nodes: FormulaTemplateNode[]): FormulaTemplateNode[] =>
    nodes.map((node) => {
      if (node.id === nodeId) {
        changed = true;
        return update(node);
      }
      return node.type === "folder"
        ? { ...node, children: visit(node.children) }
        : { ...node };
    });
  const next = visit(roots);
  return changed ? next : roots;
}

export function removeFormulaTemplateNode(
  roots: FormulaTemplateNode[],
  nodeId: string,
): FormulaTemplateNode[] {
  if (!findNode(roots, nodeId)) return roots;
  return removeNode(roots, nodeId);
}

interface NodeLocation {
  node: FormulaTemplateNode;
  parentId: string | null;
  index: number;
}

function findNode(
  nodes: FormulaTemplateNode[],
  id: string,
  parentId: string | null = null,
): NodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) return { node, parentId, index };
    if (node.type === "folder") {
      const nested = findNode(node.children, id, node.id);
      if (nested) return nested;
    }
  }
  return null;
}

function containsNode(node: FormulaTemplateNode, id: string): boolean {
  return node.id === id ||
    (node.type === "folder" && node.children.some((child) => containsNode(child, id)));
}

function removeNode(
  nodes: FormulaTemplateNode[],
  id: string,
): FormulaTemplateNode[] {
  const result: FormulaTemplateNode[] = [];
  for (const node of nodes) {
    if (node.id === id) continue;
    result.push(node.type === "folder"
      ? { ...node, children: removeNode(node.children, id) }
      : { ...node });
  }
  return result;
}

function insertNode(
  nodes: FormulaTemplateNode[],
  parentId: string | null,
  index: number,
  inserted: FormulaTemplateNode,
): { nodes: FormulaTemplateNode[]; inserted: boolean } {
  if (parentId === null) {
    const next = cloneFormulaTemplateNodes(nodes);
    next.splice(Math.max(0, Math.min(index, next.length)), 0, inserted);
    return { nodes: next, inserted: true };
  }
  let didInsert = false;
  const next = nodes.map((node) => {
    if (node.type !== "folder") return { ...node };
    if (node.id === parentId) {
      const children = cloneFormulaTemplateNodes(node.children);
      children.splice(Math.max(0, Math.min(index, children.length)), 0, inserted);
      didInsert = true;
      return { ...node, children };
    }
    const nested = insertNode(node.children, parentId, index, inserted);
    if (nested.inserted) didInsert = true;
    return { ...node, children: nested.nodes };
  });
  return { nodes: next, inserted: didInsert };
}

export function moveFormulaTemplateNode(
  roots: FormulaTemplateNode[],
  sourceId: string,
  destinationParentId: string | null,
  destinationIndex: number,
): FormulaTemplateNode[] {
  const source = findNode(roots, sourceId);
  if (!source) return roots;
  if (source.node.type === "folder" && destinationParentId && containsNode(source.node, destinationParentId)) {
    return roots;
  }
  if (destinationParentId) {
    const destination = findNode(roots, destinationParentId);
    if (!destination || destination.node.type !== "folder") return roots;
  }
  let adjustedIndex = destinationIndex;
  if (source.parentId === destinationParentId && source.index < destinationIndex) adjustedIndex--;
  const withoutSource = removeNode(roots, sourceId);
  const result = insertNode(
    withoutSource,
    destinationParentId,
    adjustedIndex,
    source.node,
  );
  return result.inserted ? result.nodes : roots;
}

export function formulaTemplateLabel(content: string, fallback: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").trim())
    .find(Boolean);
  return firstLine?.slice(0, 80) || fallback;
}
