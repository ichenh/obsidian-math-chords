import {
  App,
  finishRenderMath,
  loadMathJax,
  Modal,
  Notice,
  PluginSettingTab,
  renderMath,
  Setting,
  setIcon,
  TextComponent,
} from "obsidian";
import { runWithNotice } from "./errors";
import { normalizeCommand, validateMathEnvironment } from "./inputValidation";
import { isValidKeySequence } from "./keys";
import { t } from "./l10n/locale";
import type ObsidianMathChordsPlugin from "./main";
import { normalizeChordSetting, normalizeSequenceSetting } from "./settings";
import { buildShortcutPreview, shortcutMatchesSearch } from "./shortcutPresentation";
import type { MathEnvironment, Shortcut } from "./types";
import { shortcutStorageKey } from "./trie";

export class ObsidianMathChordsSettingTab extends PluginSettingTab {
  plugin: ObsidianMathChordsPlugin;
  private search = "";

  constructor(app: App, plugin: ObsidianMathChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private configureKeyInput(
    text: TextComponent,
    currentValue: string,
    fallback: string,
    normalize: (raw: unknown, fallback: string) => string,
    update: (value: string) => void,
  ): void {
    let value = currentValue;
    text.setValue(value).onChange((raw) => {
      value = raw.trim();
    });
    text.inputEl.addEventListener("blur", () => {
      const normalized = normalize(value || fallback, fallback);
      value = normalized;
      update(normalized);
      this.plugin.refreshInteractiveState();
      if (text.getValue() !== normalized) text.setValue(normalized);
      void runWithNotice(
        () => this.plugin.saveSettings(),
        t("noticeCouldNotSaveSettings"),
      );
    });
  }

  private renderShortcutManager(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("shortcutManagementHeading")).setHeading();

    const managerEl = containerEl.createDiv({ cls: "obsidian-math-chords-shortcuts" });
    let applyFilter = (): void => undefined;

    const toolbar = new Setting(managerEl)
      .setName(t("searchName"))
      .setDesc(t("shortcutManagementDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("searchPlaceholder"))
          .setValue(this.search)
          .onChange((value) => {
            this.search = value;
            applyFilter();
          });
        text.inputEl.addClass("obsidian-math-chords-search-input");
      })
      .addButton((button) =>
        button
          .setButtonText(t("addButton"))
          .setCta()
          .onClick(() => {
            new ShortcutEditorModal(this.app, null, (entry) => {
              if (!entry) return;
              void runWithNotice(async () => {
                const next = new Map(this.plugin.shortcuts);
                next.set(shortcutStorageKey(entry), entry);
                await this.plugin.persistShortcuts(next);
                this.display();
              }, t("noticeCouldNotSaveYaml"));
            }).open();
          }),
      );
    toolbar.settingEl.addClass("obsidian-math-chords-shortcut-toolbar");

    const summaryEl = managerEl.createDiv({ cls: "obsidian-math-chords-shortcut-summary" });
    summaryEl.setAttr("aria-live", "polite");

    const groupsEl = managerEl.createDiv({ cls: "obsidian-math-chords-shortcut-groups" });
    const emptyEl = managerEl.createDiv({
      cls: "obsidian-math-chords-empty-state is-hidden",
      text: t("noMatchingShortcuts"),
    });
    const previewRequests: ShortcutPreviewRequest[] = [];

    const grouped = new Map<string, Array<[string, Shortcut]>>();
    for (const item of this.plugin.shortcuts.entries()) {
      const group = item[1].group?.trim() || t("ungroupedGroup");
      const entries = grouped.get(group) ?? [];
      entries.push(item);
      grouped.set(group, entries);
    }

    interface RenderedShortcut {
      entry: Shortcut;
      rowEl: HTMLElement;
    }
    interface RenderedGroup {
      sectionEl: HTMLElement;
      countEl: HTMLElement;
      rows: RenderedShortcut[];
    }
    const renderedGroups: RenderedGroup[] = [];

    for (const [groupName, entries] of grouped) {
      const sectionEl = groupsEl.createEl("section", {
        cls: "obsidian-math-chords-shortcut-group",
      });
      const groupHeader = sectionEl.createDiv({ cls: "obsidian-math-chords-group-header" });
      groupHeader.createEl("h4", {
        cls: "obsidian-math-chords-group-title",
        text: groupName,
      });
      const countEl = groupHeader.createSpan({ cls: "obsidian-math-chords-group-count" });
      const listEl = sectionEl.createDiv({ cls: "obsidian-math-chords-shortcut-list" });
      listEl.setAttr("role", "list");

      const rows: RenderedShortcut[] = [];
      for (const [key, entry] of entries) {
        const rowEl = listEl.createDiv({ cls: "obsidian-math-chords-shortcut-row" });
        rowEl.setAttr("role", "listitem");

        const identityEl = rowEl.createDiv({ cls: "obsidian-math-chords-shortcut-identity" });
        const previewEl = identityEl.createDiv({ cls: "obsidian-math-chords-shortcut-preview" });
        previewEl.setAttr("aria-hidden", "true");
        previewEl.createSpan({
          cls: "obsidian-math-chords-shortcut-preview-loading",
          text: "…",
        });
        previewRequests.push({ containerEl: previewEl, command: entry.command });

        const textEl = identityEl.createDiv({ cls: "obsidian-math-chords-shortcut-text" });
        textEl.createDiv({
          cls: "obsidian-math-chords-shortcut-name",
          text: entry.name?.trim() || t("unnamedShortcut"),
        });
        textEl.createEl("code", {
          cls: "obsidian-math-chords-shortcut-command",
          text: entry.command,
        });

        const keysEl = rowEl.createDiv({ cls: "obsidian-math-chords-shortcut-keys" });
        for (const keyPart of entry.keys.trim().split(/\s+/u)) {
          keysEl.createEl("kbd", { text: keyPart });
        }

        const actionsEl = rowEl.createDiv({ cls: "obsidian-math-chords-row-actions" });
        createIconButton(actionsEl, "pencil", t("editButton"), () => {
          new ShortcutEditorModal(this.app, entry, (updated) => {
            if (!updated) return;
            void runWithNotice(async () => {
              const next = new Map(this.plugin.shortcuts);
              if (key !== shortcutStorageKey(updated)) next.delete(key);
              next.set(shortcutStorageKey(updated), updated);
              await this.plugin.persistShortcuts(next);
              this.display();
            }, t("noticeCouldNotSaveYaml"));
          }).open();
        });
        createIconButton(actionsEl, "trash-2", t("deleteButton"), () => {
          new ConfirmDeleteModal(
            this.app,
            t("deleteShortcutHeading"),
            t("deleteShortcutDesc", entry.name?.trim() || entry.keys),
            () => {
              void runWithNotice(async () => {
                const next = new Map(this.plugin.shortcuts);
                next.delete(key);
                await this.plugin.persistShortcuts(next);
                this.display();
              }, t("noticeCouldNotSaveYaml"));
            },
          ).open();
        }, true);
        rows.push({ entry, rowEl });
      }
      renderedGroups.push({ sectionEl, countEl, rows });
    }

    applyFilter = () => {
      let visibleTotal = 0;
      for (const group of renderedGroups) {
        let visibleInGroup = 0;
        for (const { entry, rowEl } of group.rows) {
          const visible = shortcutMatchesSearch(entry, this.search);
          rowEl.toggleClass("is-hidden", !visible);
          if (visible) visibleInGroup++;
        }
        group.sectionEl.toggleClass("is-hidden", visibleInGroup === 0);
        group.countEl.setText(String(visibleInGroup));
        visibleTotal += visibleInGroup;
      }

      const total = this.plugin.shortcuts.size;
      summaryEl.setText(t("shortcutCount", String(visibleTotal), String(total)));
      emptyEl.toggleClass("is-hidden", visibleTotal !== 0);
    };

    applyFilter();
    void renderShortcutPreviews(previewRequests, managerEl);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("obsidian-math-chords-settings");

    containerEl.createEl("p", {
      cls: "obsidian-math-chords-intro",
      text: t("intro"),
    });

    new Setting(containerEl)
      .setName(t("enablePluginName"))
      .setDesc(t("enablePluginDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          this.plugin.refreshInteractiveState();
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("showHintPopupName"))
      .setDesc(t("showHintPopupDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHintPopup).onChange(async (value) => {
          this.plugin.settings.showHintPopup = value;
          this.plugin.refreshInteractiveState();
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("inlinePreviewName"))
      .setDesc(t("inlinePreviewDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInlinePreview).onChange(async (value) => {
          this.plugin.settings.showInlinePreview = value;
          this.plugin.refreshInteractiveState();
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    const groupEl = containerEl.createDiv();
    new Setting(groupEl)
      .setName(t("snippetTabStopsName"))
      .setDesc(t("snippetTabStopsDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mathBraceNavEnabled).onChange(async (value) => {
          this.plugin.settings.mathBraceNavEnabled = value;
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
          this.display();
        }),
      );

    if (this.plugin.settings.mathBraceNavEnabled) {
      const nested = groupEl.createDiv({ cls: "obsidian-math-chords-settings-nested" });

      new Setting(nested)
        .setName(t("placeholderNavNextName"))
        .setDesc(t("placeholderNavNextDesc"))
        .addText((text) =>
          this.configureKeyInput(
            text,
            this.plugin.settings.mathBraceNavNextKey,
            "Alt+ArrowRight",
            normalizeChordSetting,
            (value) => (this.plugin.settings.mathBraceNavNextKey = value),
          ),
        );

      new Setting(nested)
        .setName(t("placeholderNavPrevName"))
        .setDesc(t("placeholderNavPrevDesc"))
        .addText((text) =>
          this.configureKeyInput(
            text,
            this.plugin.settings.mathBraceNavPrevKey,
            "Alt+ArrowLeft",
            normalizeChordSetting,
            (value) => (this.plugin.settings.mathBraceNavPrevKey = value),
          ),
        );
    }

    new Setting(containerEl)
      .setName(t("leaderKeyName"))
      .setDesc(t("leaderKeyDesc"))
      .addText((text) =>
        this.configureKeyInput(
          text,
          this.plugin.settings.leaderKey,
          "Alt+M",
          normalizeChordSetting,
          (value) => (this.plugin.settings.leaderKey = value),
        ),
      );

    new Setting(containerEl)
      .setName(t("wrapOutsideMathName"))
      .setDesc(t("wrapOutsideMathDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wrapOutsideMath).onChange(async (value) => {
          this.plugin.settings.wrapOutsideMath = value;
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("smartMathToggleName"))
      .setDesc(t("smartMathToggleDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.smartMathToggle).onChange(async (value) => {
          this.plugin.settings.smartMathToggle = value;
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("autoConvertPasteName"))
      .setDesc(t("autoConvertPasteDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoConvertPastedLatexDelimiters)
          .onChange(async (value) => {
            this.plugin.settings.autoConvertPastedLatexDelimiters = value;
            await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
          }),
      );

    new Setting(containerEl)
      .setName(t("reloadYamlName"))
      .setDesc(t("reloadYamlDesc"))
      .addButton((button) =>
        button.setButtonText(t("reloadButton")).onClick(async () => {
          await runWithNotice(async () => {
            await this.plugin.reloadShortcuts();
            new Notice(t("noticeReloadedYaml"));
            this.display();
          }, t("noticeCouldNotReloadYaml"));
        }),
      )
      .addButton((button) =>
        button.setButtonText(t("mergeDefaultsButton")).onClick(async () => {
          await runWithNotice(async () => {
            const count = await this.plugin.mergeDefaultShortcuts();
            new Notice(
              count > 0
                ? t("noticeMergedDefaults", String(count))
                : t("noticeNoDefaultsToMerge"),
            );
            this.display();
          }, t("noticeCouldNotMergeDefaults"));
        }),
      );

    new Setting(containerEl).setName(t("displayEnvWrapHeading")).setHeading();

    new Setting(containerEl)
      .setName(t("mathEnvWrapEnabledName"))
      .setDesc(t("mathEnvWrapEnabledDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mathEnvWrapEnabled).onChange(async (value) => {
          this.plugin.settings.mathEnvWrapEnabled = value;
          this.plugin.refreshInteractiveState();
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("mathEnvWrapKeysName"))
      .setDesc(t("mathEnvWrapKeysDesc"))
      .addText((text) =>
        this.configureKeyInput(
          text,
          this.plugin.settings.mathEnvWrapKeys,
          "Shift+E",
          normalizeSequenceSetting,
          (value) => (this.plugin.settings.mathEnvWrapKeys = value),
        ),
      );

    new Setting(containerEl)
      .setName(t("mathEnvironmentsName"))
      .addButton((button) =>
        button.setButtonText(t("addButton")).onClick(() => {
          new MathEnvironmentEditorModal(this.app, null, (entry) => {
            if (!entry) return;
            void runWithNotice(async () => {
              this.plugin.settings.mathEnvironments.push(entry);
              await this.plugin.saveSettings();
              this.display();
            }, t("noticeCouldNotSaveSettings"));
          }).open();
        }),
      );

    const envTableWrap = containerEl.createDiv({ cls: "obsidian-math-chords-table-wrap" });
    const envTable = envTableWrap.createEl("table", {
      cls: "obsidian-math-chords-table obsidian-math-chords-environment-table",
    });
    const envColumns = envTable.createEl("colgroup");
    for (const columnClass of [
      "obsidian-math-chords-env-col-order",
      "obsidian-math-chords-env-col-name",
      "obsidian-math-chords-env-col-code",
      "obsidian-math-chords-env-col-code",
      "obsidian-math-chords-env-col-actions",
    ]) {
      envColumns.createEl("col", { cls: columnClass });
    }
    const envHeader = envTable.createEl("thead").createEl("tr");
    envHeader.createEl("th", { cls: "obsidian-math-chords-drag-header", text: t("tableOrder") });
    envHeader.createEl("th", { text: t("tableName") });
    envHeader.createEl("th", { text: t("tableBegin") });
    envHeader.createEl("th", { text: t("tableEnd") });
    envHeader.createEl("th", {
      cls: "obsidian-math-chords-actions-header",
      text: t("tableActions"),
    });

    const envBody = envTable.createEl("tbody");
    for (let index = 0; index < this.plugin.settings.mathEnvironments.length; index++) {
      const entry = this.plugin.settings.mathEnvironments[index];
      const row = envBody.createEl("tr");
      const dragCell = row.createEl("td", { cls: "obsidian-math-chords-drag-cell" });
      const handle = dragCell.createSpan({ cls: "obsidian-math-chords-drag-handle" });
      handle.setAttr("draggable", "true");
      handle.setAttr("aria-label", t("dragToReorder"));
      setIcon(handle, "grip-vertical");
      row.createEl("td", { cls: "obsidian-math-chords-env-name", text: entry.name });
      row.createEl("td", { cls: "obsidian-math-chords-env-code" }).createEl("code", {
        text: entry.begin,
      });
      row.createEl("td", { cls: "obsidian-math-chords-env-code" }).createEl("code", {
        text: entry.end,
      });

      const actionsCell = row.createEl("td", {
        cls: "obsidian-math-chords-actions-cell",
      });
      const actions = actionsCell.createDiv({ cls: "obsidian-math-chords-row-actions" });

      createIconButton(actions, "pencil", t("editButton"), () => {
        new MathEnvironmentEditorModal(this.app, entry, (updated) => {
          if (!updated) return;
          void runWithNotice(async () => {
            this.plugin.settings.mathEnvironments[index] = updated;
            await this.plugin.saveSettings();
            this.display();
          }, t("noticeCouldNotSaveSettings"));
        }).open();
      });

      createIconButton(actions, "trash-2", t("deleteButton"), () => {
        new ConfirmDeleteModal(
          this.app,
          t("deleteMathEnvHeading"),
          t("deleteMathEnvDesc", entry.name),
          () => {
            void runWithNotice(async () => {
              this.plugin.settings.mathEnvironments.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            }, t("noticeCouldNotSaveSettings"));
          },
        ).open();
      }, true);
    }

    attachTableRowDragReorder(envBody, (from, to) => {
      void runWithNotice(async () => {
        const list = this.plugin.settings.mathEnvironments;
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item);
        await this.plugin.saveSettings();
        this.display();
      }, t("noticeCouldNotSaveSettings"));
    });

    this.renderShortcutManager(containerEl);
  }
}

interface ShortcutPreviewRequest {
  containerEl: HTMLElement;
  command: string;
}

async function renderShortcutPreviews(
  requests: ShortcutPreviewRequest[],
  ownerEl: HTMLElement,
): Promise<void> {
  try {
    await loadMathJax();
  } catch {
    if (!ownerEl.parentElement) return;
    for (const { containerEl } of requests) {
      if (!containerEl.parentElement) continue;
      containerEl.empty();
      containerEl.createSpan({ text: "—" });
    }
    return;
  }

  // display() may have rebuilt the settings tab while MathJax was loading.
  // Never populate preview nodes that belong to the discarded view.
  if (!ownerEl.parentElement) return;

  for (const { containerEl, command } of requests) {
    if (!containerEl.parentElement) continue;
    containerEl.empty();
    renderShortcutPreview(containerEl, command);
  }

  try {
    await finishRenderMath();
  } catch {
    // Names and LaTeX source remain visible even if stylesheet flushing fails.
  }
}

function renderShortcutPreview(containerEl: HTMLElement, command: string): void {
  const preview = buildShortcutPreview(command);
  if (preview.fallback) {
    containerEl.createEl("code", { text: preview.fallback });
    return;
  }
  if (!preview.latex) {
    containerEl.createSpan({ text: "—" });
    return;
  }

  try {
    const mathEl = renderMath(preview.latex, false);
    mathEl.addClass("obsidian-math-chords-shortcut-preview-math");
    containerEl.appendChild(mathEl);
  } catch {
    containerEl.createSpan({ text: "—" });
  }
}

function createIconButton(
  containerEl: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
  destructive = false,
): HTMLButtonElement {
  const button = containerEl.createEl("button", {
    cls: "clickable-icon obsidian-math-chords-icon-button",
  });
  button.type = "button";
  button.setAttr("aria-label", label);
  button.setAttr("title", label);
  button.toggleClass("is-destructive", destructive);
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

function attachTableRowDragReorder(
  tbody: HTMLTableSectionElement,
  onReorder: (fromIndex: number, toIndex: number) => void,
): void {
  let dragFrom: number | null = null;

  const rows = (): HTMLTableRowElement[] => Array.from(tbody.querySelectorAll("tr"));

  rows().forEach((row, index) => {
    const handle = row.querySelector<HTMLElement>(".obsidian-math-chords-drag-handle");
    if (!handle) return;

    handle.addEventListener("dragstart", (event) => {
      dragFrom = index;
      row.addClass("is-dragging");
      event.dataTransfer?.setData("text/plain", String(index));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });

    handle.addEventListener("dragend", () => {
      dragFrom = null;
      row.removeClass("is-dragging");
      rows().forEach((entry) => entry.removeClass("is-drop-target"));
    });

    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      rows().forEach((entry) => entry.removeClass("is-drop-target"));
      if (dragFrom !== null && dragFrom !== index) {
        row.addClass("is-drop-target");
      }
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      rows().forEach((entry) => entry.removeClass("is-drop-target"));
      if (dragFrom === null || dragFrom === index) return;
      onReorder(dragFrom, index);
    });
  });
}

class ConfirmDeleteModal extends Modal {
  constructor(
    app: App,
    private readonly heading: string,
    private readonly description: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl).setName(this.heading).setHeading();
    contentEl.createEl("p", {
      cls: "obsidian-math-chords-confirm-description",
      text: this.description,
    });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText(t("cancelButton")).onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(t("deleteButton"))
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ShortcutEditorModal extends Modal {
  private readonly initial: Shortcut | null;
  private readonly onSave: (entry: Shortcut | null) => void;
  private entry: Shortcut;

  constructor(app: App, initial: Shortcut | null, onSave: (entry: Shortcut | null) => void) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
    this.entry = initial
      ? { ...initial }
      : { keys: "", command: "", name: "", group: "" };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl)
      .setName(this.initial ? t("editShortcutHeading") : t("addShortcutHeading"))
      .setHeading();

    new Setting(contentEl)
      .setName(t("keySequenceName"))
      .setDesc(t("keySequenceDesc"))
      .addText((text) =>
        text.setValue(this.entry.keys).onChange((value) => {
          this.entry.keys = value;
        }),
      );

    new Setting(contentEl)
      .setName(t("commandName"))
      .setDesc(t("commandDesc"))
      .addText((text) =>
        text.setValue(this.entry.command).onChange((value) => {
          this.entry.command = value;
        }),
      );

    new Setting(contentEl).setName(t("tableName")).addText((text) =>
      text.setValue(this.entry.name ?? "").onChange((value) => {
        this.entry.name = value;
      }),
    );

    new Setting(contentEl).setName(t("groupName")).addText((text) =>
      text.setValue(this.entry.group ?? "").onChange((value) => {
        this.entry.group = value;
      }),
    );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t("saveButton"))
          .setCta()
          .onClick(() => {
            if (!this.entry.keys.trim() || !this.entry.command.trim()) {
              new Notice(t("noticeKeysAndCommandRequired"));
              return;
            }
            if (!isValidKeySequence(this.entry.keys)) {
              new Notice(t("noticeInvalidKeySequence"));
              return;
            }
            this.entry.command = normalizeCommand(this.entry.command);
            this.onSave(this.entry);
            this.close();
          }),
      )
      .addButton((button) => button.setButtonText(t("cancelButton")).onClick(() => this.close()));
  }
}

class MathEnvironmentEditorModal extends Modal {
  private readonly initial: MathEnvironment | null;
  private readonly onSave: (entry: MathEnvironment | null) => void;
  private entry: MathEnvironment;

  constructor(
    app: App,
    initial: MathEnvironment | null,
    onSave: (entry: MathEnvironment | null) => void,
  ) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
    this.entry = initial
      ? { ...initial }
      : { name: "", begin: "", end: "" };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl)
      .setName(this.initial ? t("editMathEnvHeading") : t("addMathEnvHeading"))
      .setHeading();

    new Setting(contentEl)
      .setName(t("tableName"))
      .setDesc(t("mathEnvNameDesc"))
      .addText((text) =>
        text.setValue(this.entry.name).onChange((value) => {
          this.entry.name = value;
        }),
      );

    new Setting(contentEl)
      .setName(t("mathEnvBeginName"))
      .setDesc(t("mathEnvBeginDesc"))
      .addText((text) =>
        text.setValue(this.entry.begin).onChange((value) => {
          this.entry.begin = value;
        }),
      );

    new Setting(contentEl)
      .setName(t("mathEnvEndName"))
      .setDesc(t("mathEnvEndDesc"))
      .addText((text) =>
        text.setValue(this.entry.end).onChange((value) => {
          this.entry.end = value;
        }),
      );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t("saveButton"))
          .setCta()
          .onClick(() => {
            const validated = validateMathEnvironment(this.entry);
            if (!validated) {
              new Notice(t("noticeEnvFieldsRequired"));
              return;
            }
            this.onSave(validated);
            this.close();
          }),
      )
      .addButton((button) => button.setButtonText(t("cancelButton")).onClick(() => this.close()));
  }
}
