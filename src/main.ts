import { EditorView } from "@codemirror/view";
import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { loadShortcuts, mergeShortcuts, saveShortcuts } from "./config";
import { DEFAULT_SHORTCUTS } from "./defaults";
import { DEFAULT_SETTINGS, normalizeSettings, type ObsidianMathChordsSettings } from "./settings";
import { buildTrie, shortcutStorageKey, type TrieNode } from "./trie";
import { eventMatchesChord } from "./keys";
import { LeaderController } from "./leader";
import { createInlineMathPreviewPlugin } from "./mathPreview";
import { ObsidianMathChordsSettingTab } from "./settingsTab";
import { jumpToBrace } from "./braceNav";
import { expandSnippet, insertDisplayMath, insertInlineMath } from "./snippet";
import { planMathToggle } from "./mathToggle";
import {
  findMathRegionAt,
  resolveSnippetInsertPosition,
  shouldAutoWrapSnippet,
} from "./math";
import { openEnvironmentPicker } from "./mathEnv";
import { runWithNotice } from "./errors";
import { initLocale, t } from "./l10n/locale";
import type { Shortcut } from "./types";
import {
  convertLatexDelimitersInDocument,
  convertLatexDelimitersInSelections,
  pasteConvertedLatexDelimiters,
} from "./delimiterEditor";
import { offsetToTextPosition, replaceTextRange } from "./textPosition";

export default class ObsidianMathChordsPlugin extends Plugin {
  settings: ObsidianMathChordsSettings = { ...DEFAULT_SETTINGS };
  shortcuts = new Map(
    DEFAULT_SHORTCUTS.map((shortcut) => [shortcutStorageKey(shortcut), shortcut]),
  );
  trie: TrieNode = buildTrie(DEFAULT_SHORTCUTS);

  private leaderController: LeaderController | null = null;
  private readonly keydownDocuments = new Map<Document, () => void>();
  private settingsWriteChain: Promise<void> = Promise.resolve();
  private shortcutWriteChain: Promise<void> = Promise.resolve();

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

    this.registerKeydownDocument(window.activeDocument);
    this.app.workspace.iterateAllLeaves((leaf) => {
      this.registerKeydownDocument(leaf.view.containerEl.ownerDocument);
    });
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, win) => {
        this.registerKeydownDocument(win.document);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", (_workspaceWindow, win) => {
        this.unregisterKeydownDocument(win.document);
      }),
    );
    this.register(() => {
      for (const cleanup of this.keydownDocuments.values()) cleanup();
      this.keydownDocuments.clear();
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.leaderController?.reset();
      }),
    );
    this.registerEvent(this.app.workspace.on("editor-paste", this.onEditorPaste));

    this.registerEditorExtension([
      createInlineMathPreviewPlugin({
        isEnabled: () => this.settings.showInlinePreview,
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

    this.addCommand({
      id: "convert-latex-delimiters-selection",
      name: t("cmdConvertLatexDelimitersSelection"),
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "M" }],
      editorCallback: (editor) => this.convertLatexDelimitersInSelection(editor),
    });

    this.addCommand({
      id: "convert-latex-delimiters-current-file",
      name: t("cmdConvertLatexDelimitersCurrentFile"),
      editorCallback: (editor) => this.convertLatexDelimitersInCurrentFile(editor),
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

    if (this.settings.mathBraceNavEnabled) {
      const editor = this.findEditor(cm);
      if (editor) {
        const doc = editor.getValue();
        const offset = editor.posToOffset(editor.getCursor());
        if (findMathRegionAt(doc, offset)) {
          if (
            eventMatchesChord(event, this.settings.mathBraceNavNextKey) &&
            jumpToBrace(editor, "next")
          ) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (
            eventMatchesChord(event, this.settings.mathBraceNavPrevKey) &&
            jumpToBrace(editor, "prev")
          ) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      }
    }

    if (this.leaderController?.handleKeyDown(event, cm)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private registerKeydownDocument(document: Document): void {
    if (this.keydownDocuments.has(document)) return;
    document.addEventListener("keydown", this.onDocumentKeyDown, true);
    this.keydownDocuments.set(document, () => {
      document.removeEventListener("keydown", this.onDocumentKeyDown, true);
    });
  }

  private unregisterKeydownDocument(document: Document): void {
    this.keydownDocuments.get(document)?.();
    this.keydownDocuments.delete(document);
  }

  private onEditorPaste = (event: ClipboardEvent, editor: Editor): void => {
    if (event.defaultPrevented) return;
    if (!this.settings.autoConvertPastedLatexDelimiters) return;
    const pastedText = event.clipboardData?.getData("text/plain");
    if (!pastedText) return;

    if (!pasteConvertedLatexDelimiters(editor, pastedText)) return;

    event.preventDefault();
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
    const snapshot: ObsidianMathChordsSettings = {
      ...this.settings,
      mathEnvironments: this.settings.mathEnvironments.map((environment) => ({
        ...environment,
      })),
    };
    const write = this.settingsWriteChain.then(() => this.saveData(snapshot));
    this.settingsWriteChain = write.catch(() => undefined);
    await write;
  }

  yamlPath(): string {
    return `${this.manifest.dir}/shortcuts.yaml`;
  }

  async reloadShortcuts(): Promise<void> {
    const path = this.yamlPath();
    const { shortcuts, mergedCount } = await loadShortcuts(
      async () =>
        (await this.app.vault.adapter.exists(path))
          ? this.app.vault.adapter.read(path)
          : null,
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

    await this.enqueueShortcutWrite(merged);
    this.shortcuts = new Map(merged.map((shortcut) => [shortcutStorageKey(shortcut), shortcut]));
    this.rebuildTrie();
    return added.length;
  }

  async persistShortcuts(next = this.shortcuts): Promise<void> {
    const list = [...next.values()];
    await this.enqueueShortcutWrite(list);
    this.shortcuts = new Map(next);
    this.rebuildTrie();
  }

  rebuildTrie(): void {
    this.trie = buildTrie([...this.shortcuts.values()]);
  }

  refreshInteractiveState(): void {
    this.leaderController?.reset();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      this.getEditorView(leaf.view.editor)?.dispatch({});
    });
  }

  private async enqueueShortcutWrite(shortcuts: Shortcut[]): Promise<void> {
    const snapshot = shortcuts.map((shortcut) => ({ ...shortcut }));
    const write = this.shortcutWriteChain.then(() =>
      saveShortcuts(
        (content) => this.app.vault.adapter.write(this.yamlPath(), content),
        snapshot,
      ),
    );
    this.shortcutWriteChain = write.catch(() => undefined);
    await write;
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
    const toggle = this.toggleMathBlock(editor, "inline");
    if (toggle !== "insert") return;

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
    const toggle = this.toggleMathBlock(editor, "display");
    if (toggle !== "insert") return;

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

  private convertLatexDelimitersInSelection(editor: Editor): void {
    if (convertLatexDelimitersInSelections(editor) === null) {
      new Notice(t("noticeNoTextSelected"));
    }
  }

  private convertLatexDelimitersInCurrentFile(editor: Editor): void {
    const conversion = convertLatexDelimitersInDocument(editor);
    new Notice(
      t(
        "noticeConvertedLatexDelimiters",
        String(conversion.displayCount),
        String(conversion.inlineCount),
      ),
    );
  }

  private toggleMathBlock(
    editor: Editor,
    targetKind: "inline" | "display",
  ): "insert" | "applied" | "blocked" {
    const doc = editor.getValue();
    const anchor = editor.posToOffset(editor.getCursor("anchor"));
    const head = editor.posToOffset(editor.getCursor("head"));
    const plan = planMathToggle(
      doc,
      anchor,
      head,
      targetKind,
      this.settings.smartMathToggle,
    );
    if (plan.type === "insert") return "insert";
    if (plan.type === "blocked") {
      new Notice(t("noticeEnableSmartMathToggle"));
      return "blocked";
    }

    const nextDocument = replaceTextRange(doc, plan.from, plan.to, plan.text);
    const caret = offsetToTextPosition(nextDocument, plan.caret);
    editor.transaction({
      changes: [
        {
          from: editor.offsetToPos(plan.from),
          to: editor.offsetToPos(plan.to),
          text: plan.text,
        },
      ],
      selection: { from: caret },
    });
    return "applied";
  }

  private insertShortcut(view: EditorView, shortcut: Shortcut): void {
    const editor = this.findEditor(view);
    if (!editor) return;

    if (shortcut.command === "__DISPLAY_MATH__") {
      this.insertDisplayMath(editor);
      return;
    }

    const doc = editor.getValue();
    const selFrom = editor.posToOffset(editor.getCursor("from"));
    const selTo = editor.posToOffset(editor.getCursor("to"));
    const { from: insertFrom, to: insertTo } = resolveSnippetInsertPosition(doc, selFrom, selTo);

    const selection =
      insertFrom === insertTo && selFrom === selTo
        ? editor.getSelection()
        : doc.slice(insertFrom, insertTo);

    let { text, anchor, head } = expandSnippet(shortcut.command, selection);

    const base = insertFrom;

    if (this.settings.wrapOutsideMath && shouldAutoWrapSnippet(doc, insertFrom, insertTo)) {
      text = `$${text}$`;
      anchor += 1;
      head += 1;
    }

    if (insertFrom !== selFrom || insertTo !== selTo) {
      editor.setSelection(editor.offsetToPos(insertFrom), editor.offsetToPos(insertTo));
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

    openEnvironmentPicker(this.app, editor, this.settings.mathEnvironments);
  }
}
