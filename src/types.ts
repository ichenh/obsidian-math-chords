export interface Shortcut {
  keys: string;
  command: string;
  name?: string;
  group?: string;
}

export interface MathEnvironment {
  name: string;
  begin: string;
  end: string;
}

export interface MathRegion {
  from: number;
  to: number;
  kind: "inline" | "display";
}

export interface ExpandedSnippet {
  text: string;
  anchor: number;
  head: number;
}

export interface HintEntry {
  token: string;
  shortcut?: Shortcut;
  hasChildren: boolean;
}
