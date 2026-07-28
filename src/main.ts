import { EditorView } from "@codemirror/view";
import {
  apiVersion,
  Editor,
  MarkdownView,
  moment,
  Notice,
  Plugin,
} from "obsidian";
import { loadShortcuts, mergeShortcuts, saveShortcuts } from "./config";
import { DEFAULT_SHORTCUTS } from "./defaults";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  SETTINGS_SCHEMA_VERSION,
  type ObsidianMathChordsSettings,
} from "./settings";
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
import { openEnvironmentPicker, wrapMathWithEnvironment } from "./mathEnv";
import { runWithNotice } from "./errors";
import { initLocale, t } from "./l10n/locale";
import type {
  FormulaPanelSectionId,
  FormulaTemplateNode,
  MathEnvironment,
  Shortcut,
} from "./types";
import {
  cloneFormulaTemplateNodes,
  flattenFormulaTemplates,
  recordRecentFormulaTemplate,
  setAllFormulaTemplateNodesCollapsed,
} from "./formulaTemplateModel";
import {
  convertLatexDelimitersInDocument,
  convertLatexDelimitersInSelections,
  pasteConvertedLatexDelimiters,
} from "./delimiterEditor";
import { offsetToTextPosition, replaceTextRange } from "./textPosition";
import {
  FORMULA_PANEL_VIEW_TYPE,
  FormulaPanelView,
} from "./formulaPanel";
import {
  decodeFormulaPanelDragPayload,
  FORMULA_PANEL_INSERT_MIME,
} from "./formulaPanelDrag";
import {
  formulaPanelDropCursorField,
  setFormulaPanelDropPosition,
} from "./formulaPanelDropCursor";
import { TikzBackendRegistry } from "./tikz/backendRegistry";
import { TikzRenderCoordinator } from "./tikz/coordinator";
import { processTikzCodeBlock } from "./tikz/markdownProcessor";
import { refreshActiveTikzPreviews } from "./tikz/previewSurface";
import { tikzFontPreferencesFromSettings } from "./tikz/fonts";
import { createTikzLivePreviewExtension } from "./tikz/livePreviewExtension";
import { IndexedDbTikzCache } from "./tikz/persistentCache";
import { hashTikzRenderInput } from "./tikz/hash";

export default class ObsidianMathChordsPlugin extends Plugin {
  settings: ObsidianMathChordsSettings = { ...DEFAULT_SETTINGS };
  shortcuts = new Map(
    DEFAULT_SHORTCUTS.map((shortcut) => [shortcutStorageKey(shortcut), shortcut]),
  );
  trie: TrieNode = buildTrie(DEFAULT_SHORTCUTS);

  private leaderController: LeaderController | null = null;
  private lastMarkdownEditor: Editor | null = null;
  private formulaPanelRibbonEl: HTMLElement | null = null;
  private readonly keydownDocuments = new Map<Document, () => void>();
  private settingsWriteChain: Promise<void> = Promise.resolve();
  private shortcutWriteChain: Promise<void> = Promise.resolve();
  private tikzBackends: TikzBackendRegistry | null = null;
  private tikzCoordinator: TikzRenderCoordinator | null = null;
  private tikzRenderingRegistered = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    await initLocale(this);
    await runWithNotice(() => this.reloadShortcuts(), t("noticeCouldNotLoadYaml"));
    this.initializeTikzRendering();

    this.registerView(
      FORMULA_PANEL_VIEW_TYPE,
      (leaf) => new FormulaPanelView(leaf, this),
    );
    this.updateFormulaPanelAvailability();

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
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.leaderController?.reset();
        if (leaf?.view instanceof MarkdownView) {
          this.lastMarkdownEditor = leaf.view.editor;
        }
      }),
    );
    this.registerEvent(this.app.workspace.on("editor-paste", this.onEditorPaste));

    this.registerEditorExtension([
      createInlineMathPreviewPlugin({
        isEnabled: () => this.settings.showInlinePreview,
        isActiveView: (view) => this.isActiveEditorView(view),
      }),
      formulaPanelDropCursorField,
      EditorView.domEventHandlers({
        dragover: (event, view) => {
          if (!event.dataTransfer?.types.includes(FORMULA_PANEL_INSERT_MIME)) {
            return false;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
          view.dispatch({
            effects: setFormulaPanelDropPosition.of(position),
          });
          return true;
        },
        dragleave: (event, view) => {
          if (view.dom.contains(event.relatedTarget as Node | null)) return false;
          view.dispatch({ effects: setFormulaPanelDropPosition.of(null) });
          return false;
        },
        drop: (event, view) => this.onFormulaPanelDrop(event, view),
      }),
    ]);

    this.addCommand({
      id: "open-formula-panel",
      name: t("cmdOpenFormulaPanel"),
      checkCallback: (checking) => {
        if (!this.settings.formulaPanelEnabled) return false;
        if (checking) return true;
        void runWithNotice(
          () => this.activateFormulaPanel(),
          t("noticeCouldNotOpenFormulaPanel"),
        );
        return true;
      },
    });

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
    this.tikzCoordinator?.dispose();
    this.tikzBackends?.dispose();
    this.tikzCoordinator = null;
    this.tikzBackends = null;
  }

  private initializeTikzRendering(): void {
    if (
      !this.settings.tikzRenderingEnabled ||
      this.tikzRenderingRegistered
    ) {
      return;
    }
    this.tikzRenderingRegistered = true;

    this.tikzBackends = new TikzBackendRegistry({
      getSettings: () => this.settings,
    });
    this.tikzCoordinator = new TikzRenderCoordinator({
      debounceMs: () => this.settings.tikzDebounceMs,
      selectBackend: (request) => this.tikzBackends!.select(request),
      persistentCache: new IndexedDbTikzCache(
        hashTikzRenderInput(this.app.vault.getName()),
      ),
    });
    this.registerEditorExtension(
      createTikzLivePreviewExtension({
        coordinator: this.tikzCoordinator,
        isEnabled: () =>
          this.settings.tikzRenderingEnabled &&
          this.settings.tikzLivePreview,
        getLanguage: () => this.settings.tikzCodeBlockLanguage,
        getBackend: () => this.settings.tikzBackend,
        getFonts: () => tikzFontPreferencesFromSettings(this.settings),
        getLocale: () => moment.locale(),
      }),
    );

    this.registerMarkdownCodeBlockProcessor(
      this.settings.tikzCodeBlockLanguage,
      (source, el, ctx) => {
        if (
          !this.settings.tikzRenderingEnabled ||
          !this.tikzCoordinator
        ) {
          renderTikzSourceCodeBlock(
            source,
            el,
            this.settings.tikzCodeBlockLanguage,
          );
          return;
        }
        return processTikzCodeBlock(source, el, ctx, {
          coordinator: this.tikzCoordinator,
          getBackend: () => this.settings.tikzBackend,
          getFonts: () => tikzFontPreferencesFromSettings(this.settings),
          getLocale: () => moment.locale(),
        });
      },
    );
  }

  private onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this.settings.enabled) return;

    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;

    const cm = this.getEditorView(markdownView.editor);
    if (!cm) return;
    if (!this.isEditorFocused(cm)) return;

    if (this.settings.mathBraceNavEnabled) {
      const direction = eventMatchesChord(event, this.settings.mathBraceNavNextKey)
        ? "next"
        : eventMatchesChord(event, this.settings.mathBraceNavPrevKey)
          ? "prev"
          : null;
      if (direction) {
        const editor = this.findEditor(cm);
        if (editor) {
          const doc = editor.getValue();
          const offset = editor.posToOffset(editor.getCursor());
          if (findMathRegionAt(doc, offset) && jumpToBrace(editor, direction)) {
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

  private onFormulaPanelDrop(event: DragEvent, view: EditorView): boolean {
    const encoded = event.dataTransfer?.getData(FORMULA_PANEL_INSERT_MIME) ?? "";
    const payload = decodeFormulaPanelDragPayload(encoded);
    if (!payload) return false;

    const offset = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const editor = this.findEditor(view);
    if (offset === null || !editor) return false;

    event.preventDefault();
    event.stopPropagation();
    view.dispatch({ effects: setFormulaPanelDropPosition.of(null) });
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    editor.setCursor(editor.offsetToPos(offset));

    if (payload.kind === "shortcut") {
      this.insertShortcutForEditor(editor, payload.shortcut);
    } else if (payload.kind === "environment") {
      if (!this.settings.mathEnvWrapEnabled) {
        new Notice(t("noticeEnableEnvWrap"));
      } else {
        wrapMathWithEnvironment(editor, payload.environment);
      }
    } else if (!payload.content) {
      new Notice(t("templateEmptyHint"));
    } else {
      editor.replaceSelection(payload.content);
      if (payload.id) this.recordFormulaTemplateUse(payload.id);
    }

    editor.focus();
    return true;
  }

  clearFormulaPanelDropCursors(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      this.getEditorView(leaf.view.editor)?.dispatch({
        effects: setFormulaPanelDropPosition.of(null),
      });
    });
  }

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
    const savedSchema = data?.schemaVersion;
    if (typeof savedSchema !== "number" || savedSchema < SETTINGS_SCHEMA_VERSION) {
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    const snapshot: ObsidianMathChordsSettings = {
      ...this.settings,
      mathEnvironments: this.settings.mathEnvironments.map((environment) => ({
        ...environment,
      })),
      formulaPanelGroupOrder: [...this.settings.formulaPanelGroupOrder],
      formulaPanelCollapsedGroups: [...this.settings.formulaPanelCollapsedGroups],
      formulaPanelSectionOrder: [...this.settings.formulaPanelSectionOrder],
      formulaPanelCollapsedSections: [...this.settings.formulaPanelCollapsedSections],
      formulaPanelTemplates: cloneFormulaTemplateNodes(
        this.settings.formulaPanelTemplates,
      ),
      settingsCollapsedManagementSections: [
        ...this.settings.settingsCollapsedManagementSections,
      ],
      settingsCollapsedShortcutGroups: [
        ...this.settings.settingsCollapsedShortcutGroups,
      ],
      settingsCollapsedTemplateFolders: [
        ...this.settings.settingsCollapsedTemplateFolders,
      ],
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
    this.refreshFormulaPanels();
  }

  async mergeDefaultShortcuts(): Promise<number> {
    const list = [...this.shortcuts.values()];
    const { merged, added } = mergeShortcuts(list, DEFAULT_SHORTCUTS);
    if (added.length === 0) return 0;

    await this.enqueueShortcutWrite(merged);
    this.shortcuts = new Map(merged.map((shortcut) => [shortcutStorageKey(shortcut), shortcut]));
    this.rebuildTrie();
    this.refreshFormulaPanels();
    return added.length;
  }

  async persistShortcuts(next = this.shortcuts): Promise<void> {
    const list = [...next.values()];
    await this.enqueueShortcutWrite(list);
    this.shortcuts = new Map(next);
    this.rebuildTrie();
    this.refreshFormulaPanels();
  }

  rebuildTrie(): void {
    this.trie = buildTrie([...this.shortcuts.values()]);
  }

  async activateFormulaPanel(): Promise<void> {
    if (!this.settings.formulaPanelEnabled) return;
    const activeMarkdown = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeMarkdown) this.lastMarkdownEditor = activeMarkdown.editor;

    const existingLeaf = this.app.workspace.getLeavesOfType(FORMULA_PANEL_VIEW_TYPE)[0];
    const leaf = existingLeaf ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("Could not create a formula panel leaf.");
    if (!existingLeaf) {
      await leaf.setViewState({ type: FORMULA_PANEL_VIEW_TYPE, active: true });
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  async toggleFormulaPanel(): Promise<void> {
    if (!this.settings.formulaPanelEnabled) return;
    const leaves = this.app.workspace.getLeavesOfType(FORMULA_PANEL_VIEW_TYPE);
    if (leaves.length > 0) {
      for (const leaf of leaves) leaf.detach();
      return;
    }
    await this.activateFormulaPanel();
  }

  insertShortcutFromFormulaPanel(shortcut: Shortcut): void {
    const editor = this.resolveFormulaPanelEditor();
    if (!editor) {
      new Notice(t("noticeOpenMarkdownToInsert"));
      return;
    }
    this.insertShortcutForEditor(editor, shortcut);
    editor.focus();
  }

  async updateFormulaPanelGroupOrder(order: string[]): Promise<void> {
    this.settings.formulaPanelGroupOrder = [...order];
    this.refreshFormulaPanels();
    await this.saveSettings();
  }

  async setFormulaPanelGroupCollapsed(groupId: string, collapsed: boolean): Promise<void> {
    const groups = new Set(this.settings.formulaPanelCollapsedGroups);
    if (collapsed) groups.add(groupId);
    else groups.delete(groupId);
    this.settings.formulaPanelCollapsedGroups = [...groups];
    await this.saveSettings();
  }

  async setAllFormulaPanelGroupsCollapsed(
    groupIds: string[],
    collapsed: boolean,
  ): Promise<void> {
    const collapsedGroups = new Set(this.settings.formulaPanelCollapsedGroups);
    for (const groupId of groupIds) {
      if (collapsed) collapsedGroups.add(groupId);
      else collapsedGroups.delete(groupId);
    }
    this.settings.formulaPanelCollapsedGroups = [...collapsedGroups];
    this.settings.formulaPanelTemplates = setAllFormulaTemplateNodesCollapsed(
      this.settings.formulaPanelTemplates,
      collapsed,
    );
    this.refreshFormulaPanels();
    await this.saveSettings();
  }

  async updateFormulaPanelSectionOrder(order: FormulaPanelSectionId[]): Promise<void> {
    this.settings.formulaPanelSectionOrder = [...order];
    this.refreshFormulaPanels();
    await this.saveSettings();
  }

  async setFormulaPanelSectionCollapsed(
    sectionId: FormulaPanelSectionId,
    collapsed: boolean,
  ): Promise<void> {
    const sections = new Set(this.settings.formulaPanelCollapsedSections);
    if (collapsed) sections.add(sectionId);
    else sections.delete(sectionId);
    this.settings.formulaPanelCollapsedSections = [...sections];
    await this.saveSettings();
  }

  async updateFormulaPanelTemplates(templates: FormulaTemplateNode[]): Promise<void> {
    this.settings.formulaPanelTemplates = cloneFormulaTemplateNodes(templates);
    const templateIds = new Set(
      flattenFormulaTemplates(this.settings.formulaPanelTemplates).map(
        (template) => template.id,
      ),
    );
    this.settings.formulaPanelRecentTemplateIds =
      this.settings.formulaPanelRecentTemplateIds.filter((id) =>
        templateIds.has(id),
      );
    this.refreshFormulaPanels();
    await this.saveSettings();
  }

  insertTemplateFromFormulaPanel(template: FormulaTemplateNode): void {
    if (template.type !== "template" || !template.content) {
      new Notice(t("templateEmptyHint"));
      return;
    }
    const editor = this.resolveFormulaPanelEditor();
    if (!editor) {
      new Notice(t("noticeOpenMarkdownToInsert"));
      return;
    }
    editor.replaceSelection(template.content);
    editor.focus();
    this.recordFormulaTemplateUse(template.id);
  }

  private recordFormulaTemplateUse(templateId: string): void {
    const recent = recordRecentFormulaTemplate(
      this.settings.formulaPanelRecentTemplateIds,
      templateId,
    );
    if (
      recent.length === this.settings.formulaPanelRecentTemplateIds.length &&
      recent.every(
        (id, index) => id === this.settings.formulaPanelRecentTemplateIds[index],
      )
    ) {
      return;
    }
    this.settings.formulaPanelRecentTemplateIds = recent;
    this.refreshFormulaPanels();
    void runWithNotice(
      () => this.saveSettings(),
      t("noticeCouldNotSaveSettings"),
    );
  }

  insertMathEnvironmentFromFormulaPanel(environment: MathEnvironment): void {
    if (!this.settings.mathEnvWrapEnabled) {
      new Notice(t("noticeEnableEnvWrap"));
      return;
    }
    const editor = this.resolveFormulaPanelEditor();
    if (!editor) {
      new Notice(t("noticeOpenMarkdownToInsert"));
      return;
    }
    wrapMathWithEnvironment(editor, environment);
    editor.focus();
  }

  refreshFormulaPanels(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FORMULA_PANEL_VIEW_TYPE)) {
      if (leaf.view instanceof FormulaPanelView) leaf.view.refresh();
    }
  }

  private resolveFormulaPanelEditor(): Editor | null {
    const activeMarkdown = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeMarkdown) {
      this.lastMarkdownEditor = activeMarkdown.editor;
      return activeMarkdown.editor;
    }
    if (!this.lastMarkdownEditor) return null;

    let available = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.editor === this.lastMarkdownEditor) {
        available = true;
      }
    });
    return available ? this.lastMarkdownEditor : null;
  }

  refreshInteractiveState(): void {
    this.leaderController?.reset();
    this.updateFormulaPanelAvailability();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      this.getEditorView(leaf.view.editor)?.dispatch({});
    });
  }

  refreshTikzPreviews(): void {
    refreshActiveTikzPreviews();
  }

  syncTikzRenderingState(): void {
    if (this.settings.tikzRenderingEnabled) {
      this.initializeTikzRendering();
    }
    this.refreshInteractiveState();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        leaf.view.previewMode.rerender(true);
      }
    });
  }

  async getTikzDiagnosticsReport(): Promise<string> {
    const backends = await this.tikzBackends?.diagnose();
    const coordinator = this.tikzCoordinator?.getDiagnostics();
    const nativeEngines =
      backends?.nativeEngines
        .map((engine) => `${engine.kind}: ${engine.executablePath}`)
        .join("\n") || "none";
    const lastRender = coordinator?.lastRender
      ? JSON.stringify(coordinator.lastRender)
      : "none";
    return [
      `Math Chords ${this.manifest.version}`,
      `Obsidian API ${apiVersion}`,
      `Platform: ${backends?.desktop ? "desktop" : "mobile"}`,
      `Selected backend: ${this.settings.tikzBackend}`,
      `Built-in renderer available: ${backends?.builtInAvailable ?? false}`,
      `Configured local path: ${backends?.configuredNativePath || "automatic"}`,
      "Detected local engines:",
      nativeEngines,
      `Active renders: ${coordinator?.activeRenders ?? 0}`,
      `Queued renders: ${coordinator?.queuedRenders ?? 0}`,
      `Memory cache: ${coordinator?.memoryCacheEntries ?? 0} entries, ${coordinator?.memoryCacheBytes ?? 0} bytes`,
      `Last render: ${lastRender}`,
    ].join("\n");
  }

  async clearTikzRenderCache(): Promise<void> {
    await this.tikzCoordinator?.clearCache();
  }

  restartTikzRendering(): void {
    this.tikzCoordinator?.restart();
    this.tikzBackends?.dispose();
    refreshActiveTikzPreviews(true);
  }

  private updateFormulaPanelAvailability(): void {
    if (this.settings.formulaPanelEnabled) {
      if (!this.formulaPanelRibbonEl?.isConnected) {
        this.formulaPanelRibbonEl = this.addRibbonIcon(
          "sigma",
          t("formulaPanelTitle"),
          () => {
            void runWithNotice(
              () => this.toggleFormulaPanel(),
              t("noticeCouldNotOpenFormulaPanel"),
            );
          },
        );
      }
      return;
    }

    this.formulaPanelRibbonEl?.remove();
    this.formulaPanelRibbonEl = null;
    this.app.workspace.detachLeavesOfType(FORMULA_PANEL_VIEW_TYPE);
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
    this.insertShortcutForEditor(editor, shortcut);
  }

  private insertShortcutForEditor(editor: Editor, shortcut: Shortcut): void {
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

function renderTikzSourceCodeBlock(
  source: string,
  containerEl: HTMLElement,
  language: string,
): void {
  const pre = containerEl.createEl("pre");
  const code = pre.createEl("code");
  code.className = `language-${language}`;
  code.setText(source);
  containerEl.replaceChildren(pre);
}
