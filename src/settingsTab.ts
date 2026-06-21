import { App, Modal, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import { normalizeCommand } from "./config";
import { runWithNotice } from "./errors";
import { t } from "./l10n/locale";
import { validateMathEnvironment } from "./mathEnv";
import type ObsidianMathChordsPlugin from "./main";
import type { MathEnvironment, Shortcut } from "./types";
import { shortcutStorageKey } from "./trie";

export class ObsidianMathChordsSettingTab extends PluginSettingTab {
  plugin: ObsidianMathChordsPlugin;
  private search = "";

  constructor(app: App, plugin: ObsidianMathChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

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
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("showHintPopupName"))
      .setDesc(t("showHintPopupDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHintPopup).onChange(async (value) => {
          this.plugin.settings.showHintPopup = value;
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("inlinePreviewName"))
      .setDesc(t("inlinePreviewDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInlinePreview).onChange(async (value) => {
          this.plugin.settings.showInlinePreview = value;
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
          text
            .setValue(this.plugin.settings.mathBraceNavNextKey)
            .onChange(async (value) => {
              this.plugin.settings.mathBraceNavNextKey = value.trim() || "Alt+ArrowRight";
              await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
            }),
        );

      new Setting(nested)
        .setName(t("placeholderNavPrevName"))
        .setDesc(t("placeholderNavPrevDesc"))
        .addText((text) =>
          text
            .setValue(this.plugin.settings.mathBraceNavPrevKey)
            .onChange(async (value) => {
              this.plugin.settings.mathBraceNavPrevKey = value.trim() || "Alt+ArrowLeft";
              await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
            }),
        );
    }

    new Setting(containerEl)
      .setName(t("leaderKeyName"))
      .setDesc(t("leaderKeyDesc"))
      .addText((text) =>
        text.setValue(this.plugin.settings.leaderKey).onChange(async (value) => {
          this.plugin.settings.leaderKey = value.trim() || "Alt+M";
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
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
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    new Setting(containerEl)
      .setName(t("mathEnvWrapKeysName"))
      .setDesc(t("mathEnvWrapKeysDesc"))
      .addText((text) =>
        text.setValue(this.plugin.settings.mathEnvWrapKeys).onChange(async (value) => {
          this.plugin.settings.mathEnvWrapKeys = value.trim() || "Shift+E";
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
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

    const envTable = containerEl.createEl("table", { cls: "obsidian-math-chords-table" });
    const envHeader = envTable.createEl("thead").createEl("tr");
    envHeader.createEl("th", { cls: "obsidian-math-chords-drag-header", text: t("tableOrder") });
    for (const label of [t("tableName"), t("tableBegin"), t("tableEnd"), t("tableActions")]) {
      envHeader.createEl("th", { text: label });
    }

    const envBody = envTable.createEl("tbody");
    for (let index = 0; index < this.plugin.settings.mathEnvironments.length; index++) {
      const entry = this.plugin.settings.mathEnvironments[index];
      const row = envBody.createEl("tr");
      const dragCell = row.createEl("td", { cls: "obsidian-math-chords-drag-cell" });
      const handle = dragCell.createSpan({ cls: "obsidian-math-chords-drag-handle" });
      handle.setAttr("draggable", "true");
      handle.setAttr("aria-label", t("dragToReorder"));
      setIcon(handle, "grip-vertical");
      row.createEl("td", { text: entry.name });
      row.createEl("td", { text: entry.begin });
      row.createEl("td", { text: entry.end });

      const actions = row.createEl("td");
      actions.createEl("button", { text: t("editButton"), cls: "mod-small" }).addEventListener("click", () => {
        new MathEnvironmentEditorModal(this.app, entry, (updated) => {
          if (!updated) return;
          void runWithNotice(async () => {
            this.plugin.settings.mathEnvironments[index] = updated;
            await this.plugin.saveSettings();
            this.display();
          }, t("noticeCouldNotSaveSettings"));
        }).open();
      });

      actions.createEl("button", { text: t("deleteButton"), cls: "mod-small" }).addEventListener("click", () => {
        void runWithNotice(async () => {
          this.plugin.settings.mathEnvironments.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }, t("noticeCouldNotSaveSettings"));
      });
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

    new Setting(containerEl).setName(t("shortcutManagementHeading")).setHeading();

    new Setting(containerEl)
      .setName(t("searchName"))
      .addText((text) =>
        text
          .setPlaceholder(t("searchPlaceholder"))
          .setValue(this.search)
          .onChange((value) => {
            this.search = value;
            this.display();
          }),
      )
      .addButton((button) =>
        button.setButtonText(t("addButton")).onClick(() => {
          new ShortcutEditorModal(this.app, null, (entry) => {
            if (!entry) return;
            void runWithNotice(async () => {
              this.plugin.shortcuts.set(shortcutStorageKey(entry), entry);
              await this.plugin.persistShortcuts();
              this.display();
            }, t("noticeCouldNotSaveYaml"));
          }).open();
        }),
      );

    const table = containerEl.createEl("table", { cls: "obsidian-math-chords-table" });
    const header = table.createEl("thead").createEl("tr");
    for (const label of [
      t("tableKeys"),
      t("tableCommand"),
      t("tableName"),
      t("tableGroup"),
      t("tableActions"),
    ]) {
      header.createEl("th", { text: label });
    }

    const tbody = table.createEl("tbody");
    const query = this.search.trim().toLowerCase();

    for (const [key, entry] of this.plugin.shortcuts.entries()) {
      const haystack = `${entry.keys} ${entry.command} ${entry.name ?? ""} ${entry.group ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query)) continue;

      const row = tbody.createEl("tr");
      row.createEl("td", { text: entry.keys });
      row.createEl("td", { text: entry.command });
      row.createEl("td", { text: entry.name ?? "" });
      row.createEl("td", { text: entry.group ?? "" });

      const actions = row.createEl("td");
      actions.createEl("button", { text: t("editButton"), cls: "mod-small" }).addEventListener("click", () => {
        new ShortcutEditorModal(this.app, entry, (updated) => {
          if (!updated) return;
          if (key !== shortcutStorageKey(updated)) this.plugin.shortcuts.delete(key);
          void runWithNotice(async () => {
            this.plugin.shortcuts.set(shortcutStorageKey(updated), updated);
            await this.plugin.persistShortcuts();
            this.display();
          }, t("noticeCouldNotSaveYaml"));
        }).open();
      });

      actions.createEl("button", { text: t("deleteButton"), cls: "mod-small" }).addEventListener("click", () => {
        void runWithNotice(async () => {
          this.plugin.shortcuts.delete(key);
          await this.plugin.persistShortcuts();
          this.display();
        }, t("noticeCouldNotSaveYaml"));
      });
    }
  }
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
