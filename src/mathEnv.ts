import { App, Editor, FuzzySuggestModal, Notice } from "obsidian";
import { normalizeCommand } from "./config";
import { findMathRegionAt, getMathContentBounds } from "./math";
import { insertDisplayMath } from "./snippet";
import type { MathEnvironment, MathRegion } from "./types";

export function validateMathEnvironment(raw: unknown): MathEnvironment | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.name !== "string" || !entry.name.trim()) return null;
  if (typeof entry.begin !== "string" || !entry.begin.trim()) return null;
  if (typeof entry.end !== "string" || !entry.end.trim()) return null;

  return {
    name: entry.name.trim(),
    begin: normalizeCommand(entry.begin),
    end: normalizeCommand(entry.end),
  };
}

/** Display-math region at the caret, inserting `$$…$$` first when not already inside one. */
export function resolveDisplayMathRegion(editor: Editor): MathRegion | null {
  const offset = editor.posToOffset(editor.getCursor());
  const region = findMathRegionAt(editor.getValue(), offset);

  if (region?.kind === "display") {
    return region;
  }

  if (region?.kind === "inline") {
    new Notice("请先将光标移出行内公式");
    return null;
  }

  const selection = editor.getSelection();
  const { text, anchor, head } = insertDisplayMath(selection);
  const from = editor.getCursor("from");
  const base = editor.posToOffset(from);
  editor.replaceSelection(text);
  editor.setSelection(
    editor.offsetToPos(base + anchor),
    editor.offsetToPos(base + head),
  );

  const newOffset = editor.posToOffset(editor.getCursor());
  const newRegion = findMathRegionAt(editor.getValue(), newOffset);
  if (!newRegion || newRegion.kind !== "display") {
    new Notice("无法创建行间公式块");
    return null;
  }
  return newRegion;
}

export function wrapDisplayMathWithEnvironment(
  editor: Editor,
  region: MathRegion,
  env: MathEnvironment,
): void {
  if (region.kind !== "display") return;

  const { from, to } = getMathContentBounds(region);
  const content = editor.getValue().slice(from, to);
  const wrapped = `${env.begin}${content}${env.end}`;

  editor.replaceRange(wrapped, editor.offsetToPos(from), editor.offsetToPos(to));
  editor.setSelection(editor.offsetToPos(from), editor.offsetToPos(from + wrapped.length));
}

export function openEnvironmentPicker(
  app: App,
  editor: Editor,
  environments: MathEnvironment[],
  onChoose: (env: MathEnvironment, region: MathRegion) => void,
): void {
  if (environments.length === 0) {
    new Notice("请先在设置中添加数学环境");
    return;
  }

  const region = resolveDisplayMathRegion(editor);
  if (!region) return;

  new EnvironmentPickerModal(app, environments, (env) => onChoose(env, region)).open();
}

class EnvironmentPickerModal extends FuzzySuggestModal<MathEnvironment> {
  constructor(
    app: App,
    private readonly environments: MathEnvironment[],
    private readonly onChoose: (env: MathEnvironment) => void,
  ) {
    super(app);
    this.setPlaceholder("选择数学环境…");
  }

  getItems(): MathEnvironment[] {
    return this.environments;
  }

  getItemText(item: MathEnvironment): string {
    return item.name;
  }

  onChooseItem(item: MathEnvironment): void {
    this.onChoose(item);
  }
}
