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
import { isInMath } from "./math";
import { openEnvironmentPicker, wrapDisplayMathWithEnvironment } from "./mathEnv";
import { logAndNotice, runWithNotice } from "./errors";
import type { Shortcut } from "./types";

export default class ObsidianMathChordsPlugin extends Plugin {
  settings: ObsidianMathChordsSettings = { ...DEFAULT_SETTINGS };
  shortcuts = new Map<string, Shortcut>();
  trie: TrieNode = buildTrie([]);

  private leaderController: LeaderController | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await runWithNotice(() => this.reloadShortcuts(), "Math Chords: could not load shortcuts.yaml.");

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

    this.registerDomEvent(document, "keydown", this.onDocumentKeyDown, true);
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
      name: "Insert inline math",
      editorCallback: (editor) => this.insertInlineMath(editor),
    });

    this.addCommand({
      id: "insert-display-math",
      name: "Insert display math",
      editorCallback: (editor) => this.insertDisplayMath(editor),
    });

    this.addCommand({
      id: "wrap-display-math-environment",
      name: "Wrap display math with environment",
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
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf || !(leaf.view instanceof MarkdownView)) return false;
    return this.getEditorView(leaf.view.editor) === view;
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
      logAndNotice("Math Chords: could not save settings.", error);
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
      new Notice(`Merged ${mergedCount} default shortcut(s); your custom bindings were kept.`);
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
      logAndNotice("Math Chords: could not save shortcuts.yaml.", error);
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
      logAndNotice("Math Chords: could not save shortcuts.yaml.", error);
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
      new Notice("Enable environment wrap in Math Chords settings.");
      return;
    }

    openEnvironmentPicker(this.app, editor, this.settings.mathEnvironments, (env, region) => {
      wrapDisplayMathWithEnvironment(editor, region, env);
    });
  }
}
