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

export interface FormulaTemplate {
  id: string;
  type: "template";
  name: string;
  content: string;
  collapsed: boolean;
  favorite: boolean;
}

export interface FormulaTemplateFolder {
  id: string;
  type: "folder";
  name: string;
  collapsed: boolean;
  children: FormulaTemplateNode[];
}

export type FormulaTemplateNode = FormulaTemplate | FormulaTemplateFolder;

export type FormulaPanelSectionId = "shortcuts" | "templates";

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
