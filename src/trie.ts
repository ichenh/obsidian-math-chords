import type { Shortcut, HintEntry } from "./types";
import { parseKeysField } from "./keys";

export interface TrieNode {
  children: Map<string, TrieNode>;
  shortcut?: Shortcut;
}

export function createTrieNode(): TrieNode {
  return { children: new Map() };
}

export function buildTrie(shortcuts: Shortcut[]): TrieNode {
  const root = createTrieNode();

  for (const shortcut of shortcuts) {
    const tokens = parseKeysField(shortcut.keys);
    if (tokens.length === 0) continue;

    let node = root;
    for (const token of tokens) {
      let child = node.children.get(token);
      if (!child) {
        child = createTrieNode();
        node.children.set(token, child);
      }
      node = child;
    }
    node.shortcut = shortcut;
  }

  return root;
}

export function findNode(root: TrieNode, sequence: string[]): TrieNode | null {
  let node: TrieNode = root;
  for (const token of sequence) {
    const child = node.children.get(token);
    if (!child) return null;
    node = child;
  }
  return node;
}

export function hasChildren(node: TrieNode): boolean {
  return node.children.size > 0;
}

export function listHints(node: TrieNode): HintEntry[] {
  const hints: HintEntry[] = [];
  for (const [token, child] of node.children.entries()) {
    hints.push({
      token,
      shortcut: child.shortcut,
      hasChildren: hasChildren(child),
    });
  }
  return hints.sort((a, b) => a.token.localeCompare(b.token));
}

export function shortcutStorageKey(shortcut: Shortcut): string {
  return `${shortcut.keys.trim().toLowerCase()}::${shortcut.command}`;
}

export function shortcutKey(shortcut: Shortcut): string {
  return shortcut.keys.trim().toLowerCase().replace(/\s+/g, "_");
}
