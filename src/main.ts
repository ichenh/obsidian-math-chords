import { EditorView } from "@codemirror/view";
import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { loadShortcuts, mergeShortcuts, saveShortcuts } from "./config";
import { DEFAULT_SHORTCUTS } from "./defaults";
import { DEFAULT_SETTINGS, normalizeSettings, type ObsidianMathChordsSettings } from "./settings";
import { buildTrie, shortcutStorageKey, type TrieNode } from "./trie";
import { LeaderController } from "./leader";
import { createInlineMathPreviewPlugin } from "./mathPreview";
import { ObsidianMathChordsSettingTab } from "./settingsTab";
import { expandSnippet, insertDisplayMath, insertInlineMath } from "./snippet";
import { extractMathContent, findMathRegionAt, isInMath } from "./math";
import { openEnvironmentPicker, wrapDisplayMathWithEnvironment } from "./mathEnv";
import { logAndNotice, runWithNotice } from "./errors";
import { initLocale, t } from "./l10n/locale";
import type { Shortcut } from "./types";

export default class ObsidianMathChordsPlugin extends Plugin {
  settings: ObsidianMathChordsSettings = { ...DEFAULT_SETTINGS };
  shortcuts = new Map<string, Shortcut>();
  trie: TrieNode = buildTrie([]);

  private leaderController: LeaderController | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await initLocale(this);
    await runWithNotice(() => this.reloadShortcuts(), t("noticeCouldNotLoadYaml"));

    this.leaderController = new LeaderController({
      isEnabled: () => this.settings.enabled,
      getLeaderKey: () => this.settings.leaderKey,
      getTrie: () => this.trie,
      shouldShowHints: () => this.settings.enabled && this.settings.showHintPopup,
      onCommit: (view, shortcut) => this.insertShortcut(view, shortcut),
      onNotice: (message) => new Notice(message),
      isMathEnvWrapEnabled: () => this.settings.mathEnvWrapEnabled,
      getMathEnvWrapKeys: () => this.settings.mathEnvWrapKeys,
      onMathEnvWrap: (view) => this.openMathEnvironmentPicker(view),
    });

    this.registerDomEvent(window.activeDocument, "keydown", this.onDocumentKeyDown, true);
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.leaderController?.reset();
      }),
    );

    this.registerEditorExtension([
      createInlineMathPreviewPlugin({
        isEnabled: () => this.settings.enabled && this.settings.showInlinePreview,
        isActiveView: (view) => this.isActiveEditorView(view),
      }),
    ]);

    this.addCommand({
      id: "insert-inline-math",
      name: t("cmdInsertInlineMath"),
      editorCallback: (editor) => this.insertInlineMath(editor),
    });

    this.addCommand({
      id: "insert-display-math",
      name: t("cmdInsertDisplayMath"),
      editorCallback: (editor) => this.insertDisplayMath(editor),
    });

    this.addCommand({
      id: "wrap-display-math-environment",
      name: t("cmdWrapDisplayMathEnv"),
      editorCallback: (editor) => this.openMathEnvironmentPickerForEditor(editor),
    });

    this.addSettingTab(new ObsidianMathChordsSettingTab(this.app, this));
  }

  onunload(): void {
    this.leaderController?.destroy();
    this.leaderController = null;
  }

  private onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this.settings.enabled) return;

    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;

    const cm = this.getEditorView(markdownView.editor);
    if (!cm) return;
    if (!this.isEditorFocused(cm)) return;

    if (this.leaderController?.handleKeyDown(event, cm)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private isActiveEditorView(view: EditorView): boolean {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return false;
    return this.getEditorView(markdownView.editor) === view;
  }

  private isEditorFocused(view: EditorView): boolean {
    const active = view.dom.ownerDocument.activeElement;
    return view.dom.contains(active) || view.dom === active;
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = normalizeSettings(data);
  }

  async saveSettings(): Promise<void> {
    try {
      await this.saveData(this.settings);
    } catch (error) {
      logAndNotice(t("noticeCouldNotSaveSettings"), error);
      throw error;
    }
  }

  yamlPath(): string {
    return `${this.manifest.dir}/shortcuts.yaml`;
  }

  async reloadShortcuts(): Promise<void> {
    const path = this.yamlPath();
    const { shortcuts, mergedCount } = await loadShortcuts(
      () => this.app.vault.adapter.read(path),
      (content) => this.app.vault.adapter.write(path, content),
    );

    if (mergedCount > 0) {
      new Notice(t("noticeMergedDefaults", String(mergedCount)));
    }

    this.shortcuts = new Map(
      shortcuts.map((shortcut) => [shortcutStorageKey(shortcut), shortcut]),
    );
    this.rebuildTrie();
  }

  async mergeDefaultShortcuts(): Promise<number> {
    const list = [...this.shortcuts.values()];
    const { merged, added } = mergeShortcuts(list, DEFAULT_SHORTCUTS);
    if (added.length === 0) return 0;

    this.shortcuts = new Map(merged.map((shortcut) => [shortcutStorageKey(shortcut), shortcut]));
    try {
      await saveShortcuts(
        (content) => this.app.vault.adapter.write(this.yamlPath(), content),
        merged,
      );
    } catch (error) {
      logAndNotice(t("noticeCouldNotSaveYaml"), error);
      throw error;
    }
    this.rebuildTrie();
    return added.length;
  }

  async persistShortcuts(): Promise<void> {
    const list = [...this.shortcuts.values()];
    try {
      await saveShortcuts((content) => this.app.vault.adapter.write(this.yamlPath(), content), list);
    } catch (error) {
      logAndNotice(t("noticeCouldNotSaveYaml"), error);
      throw error;
    }
    this.rebuildTrie();
  }

  rebuildTrie(): void {
    this.trie = buildTrie([...this.shortcuts.values()]);
  }

  private getEditorView(editor: Editor): EditorView | null {
    const view = (editor as unknown as { cm?: EditorView }).cm;
    return view ?? null;
  }

  private findEditor(view: EditorView): Editor | null {
    let found: Editor | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      const cm = this.getEditorView(leaf.view.editor);
      if (cm === view) found = leaf.view.editor;
    });
    return found;
  }

  insertInlineMath(editor: Editor): void {
    if (this.toggleMathBlock(editor, "inline")) {
      return;
    }

    const selection = editor.getSelection();
    const { text, anchor, head } = insertInlineMath(selection);
    const from = editor.getCursor("from");
    const base = editor.posToOffset(from);
    editor.replaceSelection(text);
    editor.setSelection(
      editor.offsetToPos(base + anchor),
      editor.offsetToPos(base + head),
    );
  }

  insertDisplayMath(editor: Editor): void {
    if (this.toggleMathBlock(editor, "display")) {
      return;
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
  }

  private toggleMathBlock(editor: Editor, targetKind: "inline" | "display"): boolean {
    if (!this.settings.smartMathToggle) return false;

    const doc = editor.getValue();
    const offset = editor.posToOffset(editor.getCursor());
    const region = findMathRegionAt(doc, offset);
    if (!region) return false;

    const rawContent = extractMathContent(doc, region);
    let text = rawContent;
    let caretOffsetInText = offset - (region.kind === "display" ? region.from + 2 : region.from + 1);
    if (caretOffsetInText < 0) caretOffsetInText = 0;
    if (caretOffsetInText > rawContent.length) caretOffsetInText = rawContent.length;

    if (targetKind === "inline" && region.kind === "display") {
      const hasOuterBlankLine = rawContent.startsWith("\n") && rawContent.endsWith("\n");
      if (hasOuterBlankLine) {
        text = rawContent.slice(1, -1);
        caretOffsetInText = Math.max(0, Math.min(text.length, caretOffsetInText - 1));
      }
    }

    if (region.kind === targetKind) {
      editor.replaceRange(text, editor.offsetToPos(region.from), editor.offsetToPos(region.to));
      const caret = region.from + Math.min(caretOffsetInText, text.length);
      const pos = editor.offsetToPos(caret);
      editor.setSelection(pos, pos);
      return true;
    }

    const wrapped = targetKind === "display" ? `$$\n${text}\n$$` : `$${text}$`;
    const caretBase = targetKind === "display" ? region.from + 3 : region.from + 1;
    editor.replaceRange(wrapped, editor.offsetToPos(region.from), editor.offsetToPos(region.to));
    const caret = caretBase + Math.min(caretOffsetInText, text.length);
    const pos = editor.offsetToPos(caret);
    editor.setSelection(pos, pos);
    return true;
  }

  private insertShortcut(view: EditorView, shortcut: Shortcut): void {
    const editor = this.findEditor(view);
    if (!editor) return;

    if (shortcut.command === "__DISPLAY_MATH__") {
      this.insertDisplayMath(editor);
      return;
    }

    const selection = editor.getSelection();
    let { text, anchor, head } = expandSnippet(shortcut.command, selection);

    const from = editor.getCursor("from");
    const base = editor.posToOffset(from);

    if (this.settings.wrapOutsideMath && !isInMath(editor.getValue(), base)) {
      text = `$${text}$`;
      anchor += 1;
      head += 1;
    }

    editor.replaceSelection(text);
    editor.setSelection(
      editor.offsetToPos(base + anchor),
      editor.offsetToPos(base + head),
    );
  }

  private openMathEnvironmentPicker(view: EditorView): void {
    const editor = this.findEditor(view);
    if (!editor) return;
    this.openMathEnvironmentPickerForEditor(editor);
  }

  private openMathEnvironmentPickerForEditor(editor: Editor): void {
    if (!this.settings.mathEnvWrapEnabled) {
      new Notice(t("noticeEnableEnvWrap"));
      return;
    }

    openEnvironmentPicker(this.app, editor, this.settings.mathEnvironments, (env, region) => {
      wrapDisplayMathWithEnvironment(editor, region, env);
    });
  }
}
