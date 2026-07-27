import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  setIcon,
  TextComponent,
  type SettingDefinition,
  type SettingDefinitionItem,
} from "obsidian";
import { runWithNotice } from "./errors";
import { normalizeCommand, validateMathEnvironment } from "./inputValidation";
import { isValidKeySequence } from "./keys";
import { t } from "./l10n/locale";
import type ObsidianMathChordsPlugin from "./main";
import {
  normalizeChordSetting,
  normalizeSequenceSetting,
  normalizeTikzCodeBlockLanguage,
  normalizeTikzFontName,
  type ObsidianMathChordsSettings,
} from "./settings";
import { shortcutMatchesSearch } from "./shortcutPresentation";
import {
  scheduleShortcutPreviews,
  type ShortcutPreviewRequest,
} from "./shortcutPreviewRenderer";
import type {
  FormulaTemplate,
  FormulaTemplateNode,
  MathEnvironment,
  Shortcut,
} from "./types";
import { shortcutStorageKey } from "./trie";
import {
  appendFormulaTemplate,
  appendFormulaTemplateFolder,
  createFormulaTemplate,
  createFormulaTemplateFolder,
  formulaTemplateLabel,
  moveFormulaTemplateNode,
  removeFormulaTemplateNode,
  updateFormulaTemplateNode,
} from "./formulaTemplateModel";

type TikzFontSettingKey = keyof Pick<
  ObsidianMathChordsSettings,
  | "tikzLatinFont"
  | "tikzSimplifiedChineseFont"
  | "tikzTraditionalChineseFont"
  | "tikzJapaneseFont"
  | "tikzKoreanFont"
>;
import {
  openFormulaTemplateEditorModal,
  openFormulaTemplateFolderModal,
} from "./formulaTemplatePanel";

export class ObsidianMathChordsSettingTab extends PluginSettingTab {
  plugin: ObsidianMathChordsPlugin;
  private search = "";
  private templateSearch = "";
  private previewCleanup: (() => void) | null = null;

  constructor(app: App, plugin: ObsidianMathChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const toggle = (
      name: string,
      desc: string,
      key: string,
      visible?: () => boolean,
    ): SettingDefinition => ({
      name,
      desc,
      visible,
      control: { type: "toggle", key },
    });
    const keyInput = (
      name: string,
      desc: string,
      currentValue: () => string,
      fallback: string,
      normalize: (raw: unknown, fallback: string) => string,
      update: (value: string) => void,
      visible?: () => boolean,
    ): SettingDefinition => ({
      name,
      desc,
      visible,
      render: (setting) => {
        setting.setName(name).setDesc(desc).addText((text) =>
          this.configureKeyInput(
            text,
            currentValue(),
            fallback,
            normalize,
            update,
          ),
        );
      },
    });

    return [
      {
        name: "Math Chords",
        desc: t("intro"),
        searchable: false,
        render: (setting) => {
          this.containerEl.addClass("obsidian-math-chords-settings");
          setting.settingEl.empty();
          setting.settingEl.addClass("obsidian-math-chords-declarative-block");
          setting.settingEl.createEl("p", {
            cls: "obsidian-math-chords-intro",
            text: t("intro"),
          });
        },
      },
      toggle(t("enablePluginName"), t("enablePluginDesc"), "enabled"),
      keyInput(
        t("leaderKeyName"),
        t("leaderKeyDesc"),
        () => this.plugin.settings.leaderKey,
        "Alt+M",
        normalizeChordSetting,
        (value) => (this.plugin.settings.leaderKey = value),
      ),
      toggle(t("showHintPopupName"), t("showHintPopupDesc"), "showHintPopup"),
      toggle(t("wrapOutsideMathName"), t("wrapOutsideMathDesc"), "wrapOutsideMath"),
      toggle(t("smartMathToggleName"), t("smartMathToggleDesc"), "smartMathToggle"),
      toggle(t("inlinePreviewName"), t("inlinePreviewDesc"), "showInlinePreview"),
      {
        type: "group",
        items: [
          {
            name: t("tikzRenderingHeading"),
            desc: t("tikzRenderingEnabledDesc"),
            render: (setting) => this.configureTikzRenderingToggle(setting),
          },
          {
            name: t("tikzLivePreviewName"),
            desc: t("tikzLivePreviewDesc"),
            visible: () => this.plugin.settings.tikzRenderingEnabled,
            render: (setting) => this.configureTikzLivePreview(setting),
          },
          {
            name: t("tikzDebounceName"),
            desc: t("tikzDebounceDesc"),
            visible: () =>
              this.plugin.settings.tikzRenderingEnabled &&
              this.plugin.settings.tikzLivePreview,
            render: (setting) => this.configureTikzDebounce(setting),
          },
          {
            name: t("tikzCodeBlockLanguageName"),
            desc: t("tikzCodeBlockLanguageDesc"),
            visible: () => this.plugin.settings.tikzRenderingEnabled,
            render: (setting) => this.configureTikzLanguage(setting),
          },
          {
            name: t("tikzBackendName"),
            desc: t("tikzBackendDesc"),
            visible: () => this.plugin.settings.tikzRenderingEnabled,
            render: (setting) => this.configureTikzBackend(setting),
          },
          {
            name: t("tikzNativeEnginePathName"),
            desc: t("tikzNativeEnginePathDesc"),
            visible: () =>
              this.plugin.settings.tikzRenderingEnabled &&
              this.plugin.settings.tikzBackend !== "wasm",
            render: (setting) => this.configureTikzNativePath(setting),
          },
          {
            name: t("tikzCustomFontsName"),
            desc: t("tikzCustomFontsDesc"),
            visible: () => this.plugin.settings.tikzRenderingEnabled,
            render: (setting) => this.configureTikzCustomFontsToggle(setting),
          },
          ...this.tikzFontSettingDefinitions(),
          {
            name: t("tikzDiagnosticsName"),
            desc: t("tikzDiagnosticsDesc"),
            visible: () => this.plugin.settings.tikzRenderingEnabled,
            render: (setting) => this.configureTikzDiagnostics(setting),
          },
        ],
      },
      toggle(
        t("formulaPanelEnabledName"),
        t("formulaPanelEnabledDesc"),
        "formulaPanelEnabled",
      ),
      {
        type: "group",
        items: [
          toggle(
            t("snippetTabStopsName"),
            t("snippetTabStopsDesc"),
            "mathBraceNavEnabled",
          ),
          keyInput(
            t("placeholderNavNextName"),
            t("placeholderNavNextDesc"),
            () => this.plugin.settings.mathBraceNavNextKey,
            "Alt+ArrowRight",
            normalizeChordSetting,
            (value) => (this.plugin.settings.mathBraceNavNextKey = value),
            () => this.plugin.settings.mathBraceNavEnabled,
          ),
          keyInput(
            t("placeholderNavPrevName"),
            t("placeholderNavPrevDesc"),
            () => this.plugin.settings.mathBraceNavPrevKey,
            "Alt+ArrowLeft",
            normalizeChordSetting,
            (value) => (this.plugin.settings.mathBraceNavPrevKey = value),
            () => this.plugin.settings.mathBraceNavEnabled,
          ),
        ],
      },
      toggle(
        t("autoConvertPasteName"),
        t("autoConvertPasteDesc"),
        "autoConvertPastedLatexDelimiters",
      ),
      {
        type: "group",
        heading: t("displayEnvWrapHeading"),
        items: [
          toggle(
            t("mathEnvWrapEnabledName"),
            t("mathEnvWrapEnabledDesc"),
            "mathEnvWrapEnabled",
          ),
          keyInput(
            t("mathEnvWrapKeysName"),
            t("mathEnvWrapKeysDesc"),
            () => this.plugin.settings.mathEnvWrapKeys,
            "Shift+E",
            normalizeSequenceSetting,
            (value) => (this.plugin.settings.mathEnvWrapKeys = value),
          ),
          {
            name: t("mathEnvironmentsName"),
            aliases: [t("tableName"), t("tableBegin"), t("tableEnd")],
            render: (setting) => {
              setting.settingEl.empty();
              setting.settingEl.addClass("obsidian-math-chords-declarative-block");
              this.renderEnvironmentManager(setting.settingEl);
            },
          },
        ],
      },
      {
        name: t("reloadYamlName"),
        desc: t("reloadYamlDesc"),
        render: (setting) => this.configureReloadSetting(setting),
      },
      {
        name: t("shortcutManagementHeading"),
        desc: t("shortcutManagementDesc"),
        aliases: [t("searchName"), t("keySequenceName"), t("commandName")],
        render: (setting) => {
          setting.settingEl.empty();
          setting.settingEl.addClass("obsidian-math-chords-declarative-block");
          this.renderShortcutManager(setting.settingEl);
          return () => {
            this.previewCleanup?.();
            this.previewCleanup = null;
          };
        },
      },
      {
        name: t("templateManagementHeading"),
        desc: t("templateManagementDesc"),
        aliases: [t("formulaPanelTemplatesSection"), t("templateTitleName")],
        render: (setting) => {
          setting.settingEl.empty();
          setting.settingEl.addClass("obsidian-math-chords-declarative-block");
          this.renderTemplateManager(setting.settingEl);
        },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof typeof this.plugin.settings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (typeof value !== "boolean") return;
    switch (key) {
      case "enabled":
      case "showHintPopup":
      case "showInlinePreview":
      case "tikzRenderingEnabled":
      case "formulaPanelEnabled":
      case "mathBraceNavEnabled":
      case "wrapOutsideMath":
      case "smartMathToggle":
      case "autoConvertPastedLatexDelimiters":
      case "mathEnvWrapEnabled":
        this.plugin.settings[key] = value;
        break;
      default:
        return;
    }
    if (
      key === "enabled" ||
      key === "showHintPopup" ||
      key === "showInlinePreview" ||
      key === "formulaPanelEnabled" ||
      key === "mathBraceNavEnabled" ||
      key === "mathEnvWrapEnabled"
    ) {
      this.plugin.refreshInteractiveState();
    }
    await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
    if (key === "tikzRenderingEnabled") {
      this.plugin.syncTikzRenderingState();
      if (!value) new Notice(t("tikzReloadNotice"));
    }
    if (
      key === "mathBraceNavEnabled" ||
      key === "tikzRenderingEnabled"
    ) {
      const refreshDomState = (this as unknown as { refreshDomState?: () => void })
        .refreshDomState;
      refreshDomState?.call(this);
    }
  }

  private refreshSettingsView(): void {
    const update = (this as unknown as { update?: () => void }).update;
    if (typeof update === "function") update.call(this);
    else this.renderLegacySettings();
  }

  private configureTikzLanguage(setting: Setting): void {
    setting
      .setName(t("tikzCodeBlockLanguageName"))
      .setDesc(t("tikzCodeBlockLanguageDesc"))
      .addText((text) => {
        text
          .setValue(this.plugin.settings.tikzCodeBlockLanguage)
          .onChange((value) => {
            this.plugin.settings.tikzCodeBlockLanguage =
              normalizeTikzCodeBlockLanguage(value);
          });
        text.inputEl.addEventListener("blur", () => {
          text.setValue(this.plugin.settings.tikzCodeBlockLanguage);
          void runWithNotice(
            () => this.plugin.saveSettings(),
            t("noticeCouldNotSaveSettings"),
          );
          new Notice(t("tikzReloadNotice"));
        });
      });
  }

  private configureTikzRenderingToggle(setting: Setting): void {
    setting
      .setName(t("tikzRenderingHeading"))
      .setDesc(t("tikzRenderingEnabledDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tikzRenderingEnabled)
          .onChange(async (value) => {
            this.plugin.settings.tikzRenderingEnabled = value;
            await runWithNotice(
              () => this.plugin.saveSettings(),
              t("noticeCouldNotSaveSettings"),
            );
            this.plugin.syncTikzRenderingState();
            if (!value) new Notice(t("tikzReloadNotice"));
            this.refreshSettingsView();
          }),
      );
  }

  private configureTikzLivePreview(setting: Setting): void {
    setting
      .setName(t("tikzLivePreviewName"))
      .setDesc(t("tikzLivePreviewDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tikzLivePreview)
          .onChange(async (value) => {
            this.plugin.settings.tikzLivePreview = value;
            await runWithNotice(
              () => this.plugin.saveSettings(),
              t("noticeCouldNotSaveSettings"),
            );
            this.plugin.refreshInteractiveState();
            this.refreshSettingsView();
          }),
      );
  }

  private configureTikzDebounce(setting: Setting): void {
    setting
      .setName(t("tikzDebounceName"))
      .setDesc(t("tikzDebounceDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(50, 1_000, 10)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.tikzDebounceMs)
          .onChange((value) => {
            this.plugin.settings.tikzDebounceMs = value;
            void runWithNotice(
              () => this.plugin.saveSettings(),
              t("noticeCouldNotSaveSettings"),
            );
          }),
      );
  }

  private configureTikzNativePath(setting: Setting): void {
    setting
      .setName(t("tikzNativeEnginePathName"))
      .setDesc(t("tikzNativeEnginePathDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("tikzNativeEngineAutomatic"))
          .setValue(this.plugin.settings.tikzNativeEnginePath)
          .onChange((value) => {
            this.plugin.settings.tikzNativeEnginePath = value.trim();
          });
        text.inputEl.addEventListener("blur", () => {
          void runWithNotice(
            () => this.plugin.saveSettings(),
            t("noticeCouldNotSaveSettings"),
          );
          new Notice(t("tikzReloadNotice"));
        });
      })
      .addExtraButton((button) =>
        button
          .setIcon("rotate-ccw")
          .setTooltip(t("tikzNativeEngineAutomaticAction"))
          .onClick(async () => {
            this.plugin.settings.tikzNativeEnginePath = "";
            const input = setting.controlEl.querySelector("input");
            if (input) input.value = "";
            await runWithNotice(
              () => this.plugin.saveSettings(),
              t("noticeCouldNotSaveSettings"),
            );
            new Notice(t("tikzReloadNotice"));
          }),
      );
  }

  private configureTikzCustomFontsToggle(setting: Setting): void {
    setting
      .setName(t("tikzCustomFontsName"))
      .setDesc(t("tikzCustomFontsDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tikzCustomFontsEnabled)
          .onChange(async (value) => {
            this.plugin.settings.tikzCustomFontsEnabled = value;
            await runWithNotice(
              async () => {
                await this.plugin.saveSettings();
                this.plugin.refreshTikzPreviews();
              },
              t("noticeCouldNotSaveSettings"),
            );
            this.refreshSettingsView();
          }),
      );
  }

  private tikzFontSettingDefinitions(): SettingDefinition[] {
    const definitions: Array<{
      key: TikzFontSettingKey;
      name: string;
      placeholder: string;
    }> = [
      { key: "tikzLatinFont", name: "Latin font", placeholder: "Latin Modern Roman" },
      { key: "tikzSimplifiedChineseFont", name: "简体中文字体", placeholder: "Noto Serif CJK SC" },
      { key: "tikzTraditionalChineseFont", name: "繁體中文字型", placeholder: "Noto Serif CJK TC" },
      { key: "tikzJapaneseFont", name: "日本語フォント", placeholder: "Source Han Serif JP" },
      { key: "tikzKoreanFont", name: "한국어 글꼴", placeholder: "Source Han Serif K" },
    ];
    return definitions.map(({ key, name, placeholder }) => ({
      name,
      desc: t("tikzFontOverrideDesc"),
      visible: () =>
        this.plugin.settings.tikzRenderingEnabled &&
        this.plugin.settings.tikzCustomFontsEnabled,
      render: (setting) =>
        this.configureTikzFont(setting, key, name, placeholder),
    }));
  }

  private configureTikzFont(
    setting: Setting,
    key: TikzFontSettingKey,
    name: string,
    placeholder: string,
  ): void {
    setting
      .setName(name)
      .setDesc(t("tikzFontOverrideDesc"))
      .addText((text) => {
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings[key])
          .onChange((value) => {
            this.plugin.settings[key] = normalizeTikzFontName(value);
          });
        text.inputEl.addEventListener("blur", () => {
          text.setValue(this.plugin.settings[key]);
          void runWithNotice(
            async () => {
              await this.plugin.saveSettings();
              this.plugin.refreshTikzPreviews();
            },
            t("noticeCouldNotSaveSettings"),
          );
        });
      });
  }

  private configureTikzBackend(setting: Setting): void {
    setting
      .setName(t("tikzBackendName"))
      .setDesc(t("tikzBackendDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("wasm", t("tikzBackendWasm"))
          .addOption("native", t("tikzBackendNative"))
          .addOption("auto", t("tikzBackendAuto"))
          .setValue(this.plugin.settings.tikzBackend)
          .onChange(async (value) => {
            this.plugin.settings.tikzBackend =
              value === "native" || value === "auto" ? value : "wasm";
            await runWithNotice(
              () => this.plugin.saveSettings(),
              t("noticeCouldNotSaveSettings"),
            );
            this.plugin.refreshTikzPreviews();
            this.refreshSettingsView();
          }),
      );
  }

  private configureTikzDiagnostics(setting: Setting): void {
    setting
      .setName(t("tikzDiagnosticsName"))
      .setDesc(t("tikzDiagnosticsDesc"))
      .addButton((button) =>
        button.setButtonText(t("tikzDiagnosticsCopy")).onClick(async () => {
          await runWithNotice(async () => {
            const report = await this.plugin.getTikzDiagnosticsReport();
            const clipboard =
              setting.settingEl.ownerDocument.defaultView?.navigator.clipboard;
            if (!clipboard) throw new Error("Clipboard access is unavailable.");
            await clipboard.writeText(report);
            new Notice(t("tikzDiagnosticsCopied"));
          }, t("tikzDiagnosticsFailed"));
        }),
      )
      .addExtraButton((button) =>
        button
          .setIcon("trash-2")
          .setTooltip(t("tikzDiagnosticsClearCache"))
          .onClick(async () => {
            await runWithNotice(async () => {
              await this.plugin.clearTikzRenderCache();
              new Notice(t("tikzDiagnosticsCacheCleared"));
            }, t("tikzDiagnosticsFailed"));
          }),
      )
      .addExtraButton((button) =>
        button
          .setIcon("refresh-cw")
          .setTooltip(t("tikzDiagnosticsRestart"))
          .onClick(() => {
            this.plugin.restartTikzRendering();
            new Notice(t("tikzDiagnosticsRestarted"));
          }),
      );
  }

  private configureReloadSetting(setting: Setting): void {
    setting
      .setName(t("reloadYamlName"))
      .setDesc(t("reloadYamlDesc"))
      .addButton((button) =>
        button.setButtonText(t("reloadButton")).onClick(async () => {
          await runWithNotice(async () => {
            await this.plugin.reloadShortcuts();
            new Notice(t("noticeReloadedYaml"));
            this.refreshSettingsView();
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
            this.refreshSettingsView();
          }, t("noticeCouldNotMergeDefaults"));
        }),
      );
  }

  private renderEnvironmentManager(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t("mathEnvironmentsName"))
      .addExtraButton((button) => {
        button.extraSettingsEl.addClass("obsidian-math-chords-manager-add-action");
        return button
          .setIcon("plus")
          .setTooltip(t("addButton"))
          .onClick(() => {
          new MathEnvironmentEditorModal(this.app, null, (entry) => {
            if (!entry) return;
            void runWithNotice(async () => {
              this.plugin.settings.mathEnvironments.push(entry);
              await this.plugin.saveSettings();
              this.plugin.refreshFormulaPanels();
              this.refreshSettingsView();
            }, t("noticeCouldNotSaveSettings"));
          }).open();
          });
      });

    const envTableWrap = containerEl.createDiv({ cls: "obsidian-math-chords-table-wrap" });
    const envTable = envTableWrap.createEl("table", {
      cls: "obsidian-math-chords-table obsidian-math-chords-environment-table",
    });
    envTableWrap.addEventListener(
      "scroll",
      () => {
        envTableWrap.toggleClass("is-scrolled-x", Math.abs(envTableWrap.scrollLeft) > 1);
      },
      { passive: true },
    );
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
    envHeader.createEl("th", {
      cls: "obsidian-math-chords-drag-header",
      text: t("tableOrder"),
    });
    envHeader.createEl("th", {
      cls: "obsidian-math-chords-env-name-header",
      text: t("tableName"),
    });
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
      row.createEl("td", {
        cls: "obsidian-math-chords-env-name",
        text: entry.name,
        attr: { title: entry.name },
      });
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
            this.plugin.refreshFormulaPanels();
            this.refreshSettingsView();
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
              this.plugin.refreshFormulaPanels();
              this.refreshSettingsView();
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
        this.plugin.refreshFormulaPanels();
        this.refreshSettingsView();
      }, t("noticeCouldNotSaveSettings"));
    });
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

  private setCollapsedSettingsEntry(
    key:
      | "settingsCollapsedManagementSections"
      | "settingsCollapsedShortcutGroups"
      | "settingsCollapsedTemplateFolders",
    id: string,
    collapsed: boolean,
  ): void {
    const entries = new Set(this.plugin.settings[key]);
    if (collapsed) entries.add(id);
    else entries.delete(id);
    this.plugin.settings[key] = [...entries];
    void runWithNotice(
      () => this.plugin.saveSettings(),
      t("noticeCouldNotSaveSettings"),
    );
  }

  private renderCollapsibleManager(
    containerEl: HTMLElement,
    id: "shortcuts" | "templates",
    title: string,
  ): HTMLElement {
    const collapsedEntries = new Set(
      this.plugin.settings.settingsCollapsedManagementSections,
    );
    let collapsed = collapsedEntries.has(id);
    const sectionEl = containerEl.createEl("section", {
      cls: "obsidian-math-chords-manager-section",
    });
    const heading = new Setting(sectionEl).setName(title).setHeading();
    heading.settingEl.addClass("obsidian-math-chords-manager-header");
    const bodyEl = sectionEl.createDiv({
      cls: "obsidian-math-chords-manager-body",
    });
    const update = (): void => {
      bodyEl.toggleClass("is-hidden", collapsed);
    };
    heading.addExtraButton((button) => {
      const updateButton = (): void => {
        button
          .setIcon(collapsed ? "chevron-right" : "chevron-down")
          .setTooltip(t(collapsed ? "expandGroup" : "collapseGroup"));
      };
      updateButton();
      button.onClick(() => {
        collapsed = !collapsed;
        update();
        updateButton();
        this.setCollapsedSettingsEntry(
          "settingsCollapsedManagementSections",
          id,
          collapsed,
        );
      });
    });
    update();
    return bodyEl;
  }

  private renderShortcutManager(containerEl: HTMLElement): void {
    const managerBodyEl = this.renderCollapsibleManager(
      containerEl,
      "shortcuts",
      t("shortcutManagementHeading"),
    );
    const managerEl = managerBodyEl.createDiv({ cls: "obsidian-math-chords-shortcuts" });
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
        text.inputEl.type = "search";
        text.inputEl.setAttr("aria-label", t("searchName"));
        text.inputEl.setAttr("spellcheck", "false");
        text.inputEl.addClass("obsidian-math-chords-search-input");
      })
      .addExtraButton((button) => {
        button.extraSettingsEl.addClass("obsidian-math-chords-manager-add-action");
        return button
          .setIcon("plus")
          .setTooltip(t("addButton"))
          .onClick(() => {
            new ShortcutEditorModal(this.app, null, (entry) => {
              if (!entry) return;
              void runWithNotice(async () => {
                const next = new Map(this.plugin.shortcuts);
                next.set(shortcutStorageKey(entry), entry);
                await this.plugin.persistShortcuts(next);
                this.refreshSettingsView();
              }, t("noticeCouldNotSaveYaml"));
            }).open();
          });
      });
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
      listEl: HTMLElement;
      isCollapsed: () => boolean;
      rows: RenderedShortcut[];
    }
    const renderedGroups: RenderedGroup[] = [];

    for (const [groupName, entries] of grouped) {
      const sectionEl = groupsEl.createEl("section", {
        cls: "obsidian-math-chords-shortcut-group",
      });
      const groupHeader = new Setting(sectionEl).setName(groupName).setHeading();
      groupHeader.settingEl.addClass("obsidian-math-chords-group-header");
      groupHeader.nameEl.addClass("obsidian-math-chords-group-title");
      const countEl = groupHeader.nameEl.createSpan({
        cls: "obsidian-math-chords-group-count",
      });
      const collapsedGroups = new Set(
        this.plugin.settings.settingsCollapsedShortcutGroups,
      );
      let collapsed = collapsedGroups.has(groupName);
      groupHeader.addExtraButton((button) => {
        const updateButton = (): void => {
          button
            .setIcon(collapsed ? "chevron-right" : "chevron-down")
            .setTooltip(t(collapsed ? "expandGroup" : "collapseGroup"));
        };
        updateButton();
        button.onClick(() => {
          collapsed = !collapsed;
          listEl.toggleClass("is-hidden", collapsed && !this.search.trim());
          updateButton();
          this.setCollapsedSettingsEntry(
            "settingsCollapsedShortcutGroups",
            groupName,
            collapsed,
          );
        });
      });
      const listEl = sectionEl.createDiv({ cls: "obsidian-math-chords-shortcut-list" });
      listEl.setAttr("role", "list");
      listEl.toggleClass("is-hidden", collapsed && !this.search.trim());

      const rows: RenderedShortcut[] = [];
      for (const [key, entry] of entries) {
        const shortcutName = entry.name?.trim() || t("unnamedShortcut");
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
          text: shortcutName,
          attr: { title: shortcutName },
        });
        textEl.createEl("code", {
          cls: "obsidian-math-chords-shortcut-command",
          text: entry.command,
          attr: { title: entry.command },
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
              this.refreshSettingsView();
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
                this.refreshSettingsView();
              }, t("noticeCouldNotSaveYaml"));
            },
          ).open();
        }, true);
        rows.push({ entry, rowEl });
      }
      renderedGroups.push({
        sectionEl,
        countEl,
        listEl,
        isCollapsed: () => collapsed,
        rows,
      });
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
        group.listEl.toggleClass(
          "is-hidden",
          visibleInGroup === 0 || (group.isCollapsed() && !this.search.trim()),
        );
        group.countEl.setText(String(visibleInGroup));
        visibleTotal += visibleInGroup;
      }

      const total = this.plugin.shortcuts.size;
      summaryEl.setText(t("shortcutCount", String(visibleTotal), String(total)));
      emptyEl.toggleClass("is-hidden", visibleTotal !== 0);
    };

    applyFilter();
    this.previewCleanup = scheduleShortcutPreviews(previewRequests, managerEl);
  }

  private renderTemplateManager(containerEl: HTMLElement): void {
    const managerBodyEl = this.renderCollapsibleManager(
      containerEl,
      "templates",
      t("templateManagementHeading"),
    );
    const managerEl = managerBodyEl.createDiv({
      cls: "obsidian-math-chords-template-manager",
    });
    let applyFilter = (): void => undefined;
    let dragId: string | null = null;
    const persist = (templates: FormulaTemplateNode[]): void => {
      if (templates === this.plugin.settings.formulaPanelTemplates) return;
      void runWithNotice(async () => {
        await this.plugin.updateFormulaPanelTemplates(templates);
        this.refreshSettingsView();
      }, t("noticeCouldNotSaveSettings"));
    };
    const createTemplate = (parentId: string | null): void => {
      const template = createFormulaTemplate();
      openFormulaTemplateEditorModal(this.app, template, (updated) => {
        persist(appendFormulaTemplate(
          this.plugin.settings.formulaPanelTemplates,
          parentId,
          { ...template, ...updated },
        ));
      });
    };

    const toolbar = new Setting(managerEl)
      .setName(t("searchName"))
      .setDesc(t("templateManagementDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("templateSearchPlaceholder"))
          .setValue(this.templateSearch)
          .onChange((value) => {
            this.templateSearch = value;
            applyFilter();
          });
        text.inputEl.type = "search";
        text.inputEl.setAttr("aria-label", t("searchName"));
        text.inputEl.setAttr("spellcheck", "false");
        text.inputEl.addClass("obsidian-math-chords-search-input");
      })
      .addExtraButton((button) => {
        button.extraSettingsEl.addClass("obsidian-math-chords-manager-add-action");
        return button
          .setIcon("folder-plus")
          .setTooltip(t("addTemplateFolder"))
          .onClick(() => {
          openFormulaTemplateFolderModal(this.app, (name) => {
            persist(appendFormulaTemplateFolder(
              this.plugin.settings.formulaPanelTemplates,
              null,
              createFormulaTemplateFolder(name),
            ));
          });
          });
      })
      .addExtraButton((button) => {
        button.extraSettingsEl.addClass("obsidian-math-chords-manager-add-action");
        return button
          .setIcon("file-plus")
          .setTooltip(t("addTemplate"))
          .onClick(() => createTemplate(null));
      });
    toolbar.settingEl.addClass(
      "obsidian-math-chords-shortcut-toolbar",
      "obsidian-math-chords-template-toolbar",
    );

    const summaryEl = managerEl.createDiv({
      cls: "obsidian-math-chords-shortcut-summary",
    });
    summaryEl.setAttr("aria-live", "polite");
    const treeEl = managerEl.createDiv({
      cls: "obsidian-math-chords-settings-template-tree",
    });
    const emptyEl = managerEl.createDiv({
      cls: "obsidian-math-chords-empty-state is-hidden",
      text: t("noMatchingTemplates"),
    });

    interface RenderedTemplateSetting {
      node: FormulaTemplateNode;
      element: HTMLElement;
      body: HTMLElement | null;
      isCollapsed: () => boolean;
      children: RenderedTemplateSetting[];
    }

    const countTemplates = (nodes: FormulaTemplateNode[]): number =>
      nodes.reduce(
        (total, node) => total +
          (node.type === "template" ? 1 : countTemplates(node.children)),
        0,
      );

    const editTemplate = (template: FormulaTemplate): void => {
      openFormulaTemplateEditorModal(this.app, template, (updated) => {
        persist(updateFormulaTemplateNode(
          this.plugin.settings.formulaPanelTemplates,
          template.id,
          (node) => node.type === "template" ? { ...node, ...updated } : node,
        ));
      });
    };

    const clearDropIndicators = (): void => {
      treeEl
        .querySelectorAll<HTMLElement>(
          ".is-drop-before, .is-drop-after, .is-drop-inside, .is-root-drop-target",
        )
        .forEach((element) => element.removeClass(
          "is-drop-before",
          "is-drop-after",
          "is-drop-inside",
          "is-root-drop-target",
        ));
    };

    const createDragHandle = (
      parentEl: HTMLElement,
      node: FormulaTemplateNode,
      nodeEl: HTMLElement,
      parentId: string | null,
      index: number,
    ): HTMLButtonElement => {
      const buttonEl = parentEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-template-setting-drag",
        attr: {
          type: "button",
          draggable: "true",
          title: t("dragToReorder"),
          "aria-label": t("dragToReorder"),
        },
      });
      setIcon(buttonEl, "grip-vertical");
      buttonEl.addEventListener("dragstart", (event) => {
        dragId = node.id;
        nodeEl.addClass("is-dragging");
        event.dataTransfer?.setData("application/x-math-chords-template-node", node.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      buttonEl.addEventListener("dragend", () => {
        dragId = null;
        nodeEl.removeClass("is-dragging");
        clearDropIndicators();
      });
      buttonEl.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        persist(moveFormulaTemplateNode(
          this.plugin.settings.formulaPanelTemplates,
          node.id,
          parentId,
          index + (event.key === "ArrowUp" ? -1 : 2),
        ));
      });
      return buttonEl;
    };

    const makeDropTarget = (
      targetEl: HTMLElement,
      indicatorEl: HTMLElement,
      node: FormulaTemplateNode,
      parentId: string | null,
      index: number,
    ): void => {
      targetEl.addEventListener("dragover", (event) => {
        if (!dragId || dragId === node.id) return;
        event.preventDefault();
        event.stopPropagation();
        clearDropIndicators();
        const bounds = targetEl.getBoundingClientRect();
        const ratio = bounds.height > 0
          ? (event.clientY - bounds.top) / bounds.height
          : 0;
        if (node.type === "folder" && ratio >= 0.25 && ratio <= 0.75) {
          indicatorEl.addClass("is-drop-inside");
        } else {
          indicatorEl.addClass(ratio < 0.5 ? "is-drop-before" : "is-drop-after");
        }
      });
      targetEl.addEventListener("dragleave", (event) => {
        if (!indicatorEl.contains(event.relatedTarget as Node | null)) {
          clearDropIndicators();
        }
      });
      targetEl.addEventListener("drop", (event) => {
        if (!dragId || dragId === node.id) return;
        event.preventDefault();
        event.stopPropagation();
        const inside = indicatorEl.hasClass("is-drop-inside") && node.type === "folder";
        const after = indicatorEl.hasClass("is-drop-after");
        clearDropIndicators();
        persist(moveFormulaTemplateNode(
          this.plugin.settings.formulaPanelTemplates,
          dragId,
          inside ? node.id : parentId,
          inside ? node.children.length : index + (after ? 1 : 0),
        ));
      });
    };

    const renderNodes = (
      parentEl: HTMLElement,
      nodes: FormulaTemplateNode[],
      parentId: string | null,
    ): RenderedTemplateSetting[] => nodes.map((node, index) => {
      if (node.type === "template") {
        const rowEl = parentEl.createDiv({
          cls: "obsidian-math-chords-shortcut-row obsidian-math-chords-template-setting-row",
        });
        createDragHandle(rowEl, node, rowEl, parentId, index);
        const identityEl = rowEl.createDiv({
          cls: "obsidian-math-chords-shortcut-identity",
        });
        const textEl = identityEl.createDiv({
          cls: "obsidian-math-chords-shortcut-text",
        });
        const name = node.name || formulaTemplateLabel(node.content, t("untitledTemplate"));
        textEl.createDiv({
          cls: "obsidian-math-chords-shortcut-name",
          text: name,
          attr: { title: name },
        });
        textEl.createEl("code", {
          cls: "obsidian-math-chords-shortcut-command",
          text: node.content || t("templateEmptyHint"),
          attr: { title: node.content || t("templateEmptyHint") },
        });
        const actionsEl = rowEl.createDiv({
          cls: "obsidian-math-chords-row-actions",
        });
        createIconButton(actionsEl, "pencil", t("editTemplate"), () => {
          editTemplate(node);
        });
        createIconButton(actionsEl, "trash-2", t("deleteButton"), () => {
          new ConfirmDeleteModal(
            this.app,
            t("deleteTemplateHeading"),
            t("deleteTemplateDesc", name),
            () => persist(removeFormulaTemplateNode(
              this.plugin.settings.formulaPanelTemplates,
              node.id,
            )),
          ).open();
        }, true);
        makeDropTarget(rowEl, rowEl, node, parentId, index);
        return {
          node,
          element: rowEl,
          body: null,
          isCollapsed: () => false,
          children: [],
        };
      }

      const sectionEl = parentEl.createEl("section", {
        cls: "obsidian-math-chords-template-setting-folder",
      });
      const header = new Setting(sectionEl).setName(
        node.name || t("newTemplateFolderName"),
      ).setHeading();
      header.settingEl.addClass(
        "obsidian-math-chords-group-header",
        "obsidian-math-chords-template-folder-header",
      );
      header.nameEl.addClass("obsidian-math-chords-group-title");
      const dragButton = createDragHandle(
        header.nameEl,
        node,
        sectionEl,
        parentId,
        index,
      );
      header.nameEl.prepend(dragButton);
      const countEl = header.nameEl.createSpan({
        cls: "obsidian-math-chords-group-count",
        text: String(countTemplates(node.children)),
      });
      countEl.setAttr("aria-hidden", "true");
      header.addExtraButton((button) => {
        button.extraSettingsEl.addClass("obsidian-math-chords-manager-add-action");
        return button
          .setIcon("folder-plus")
          .setTooltip(t("addTemplateFolder"))
          .onClick(() => {
          openFormulaTemplateFolderModal(this.app, (name) => {
            persist(appendFormulaTemplateFolder(
              this.plugin.settings.formulaPanelTemplates,
              node.id,
              createFormulaTemplateFolder(name),
            ));
          });
          });
      });
      header.addExtraButton((button) => {
        button.extraSettingsEl.addClass("obsidian-math-chords-manager-add-action");
        return button
          .setIcon("file-plus")
          .setTooltip(t("addTemplate"))
          .onClick(() => createTemplate(node.id));
      });
      header.addExtraButton((button) => button
        .setIcon("pencil")
        .setTooltip(t("editTemplateFolder"))
        .onClick(() => {
          openFormulaTemplateFolderModal(this.app, (name) => {
            persist(updateFormulaTemplateNode(
              this.plugin.settings.formulaPanelTemplates,
              node.id,
              (current) => current.type === "folder"
                ? { ...current, name }
                : current,
            ));
          }, node.name);
        }));
      header.addExtraButton((button) => button
        .setIcon("trash-2")
        .setTooltip(t("deleteButton"))
        .onClick(() => {
          new ConfirmDeleteModal(
            this.app,
            t("deleteTemplateFolderHeading"),
            t("deleteTemplateFolderDesc", node.name || t("newTemplateFolderName")),
            () => persist(removeFormulaTemplateNode(
              this.plugin.settings.formulaPanelTemplates,
              node.id,
            )),
          ).open();
        }));
      const collapsedFolders = new Set(
        this.plugin.settings.settingsCollapsedTemplateFolders,
      );
      let collapsed = collapsedFolders.has(node.id);
      const bodyEl = sectionEl.createDiv({
        cls: "obsidian-math-chords-settings-template-folder-body",
      });
      header.addExtraButton((button) => {
        const updateButton = (): void => {
          button
            .setIcon(collapsed ? "chevron-right" : "chevron-down")
            .setTooltip(t(collapsed ? "expandGroup" : "collapseGroup"));
        };
        updateButton();
        button.onClick(() => {
          collapsed = !collapsed;
          bodyEl.toggleClass("is-hidden", collapsed && !this.templateSearch.trim());
          updateButton();
          this.setCollapsedSettingsEntry(
            "settingsCollapsedTemplateFolders",
            node.id,
            collapsed,
          );
        });
      });
      bodyEl.toggleClass("is-hidden", collapsed && !this.templateSearch.trim());
      makeDropTarget(header.settingEl, sectionEl, node, parentId, index);
      const children = renderNodes(bodyEl, node.children, node.id);
      return {
        node,
        element: sectionEl,
        body: bodyEl,
        isCollapsed: () => collapsed,
        children,
      };
    });

    const rendered = renderNodes(
      treeEl,
      this.plugin.settings.formulaPanelTemplates,
      null,
    );
    const treeEmptyEl = treeEl.createDiv({
      cls: "obsidian-math-chords-template-setting-empty is-hidden",
      text: t("templateSectionEmptyHint"),
    });
    const rootDropEl = treeEl.createDiv({
      cls: "obsidian-math-chords-template-setting-root-drop",
      attr: { "aria-hidden": "true" },
    });
    rootDropEl.addEventListener("dragover", (event) => {
      if (!dragId) return;
      event.preventDefault();
      event.stopPropagation();
      clearDropIndicators();
      rootDropEl.addClass("is-root-drop-target");
    });
    rootDropEl.addEventListener("dragleave", () => clearDropIndicators());
    rootDropEl.addEventListener("drop", (event) => {
      if (!dragId) return;
      event.preventDefault();
      event.stopPropagation();
      clearDropIndicators();
      persist(moveFormulaTemplateNode(
        this.plugin.settings.formulaPanelTemplates,
        dragId,
        null,
        this.plugin.settings.formulaPanelTemplates.length,
      ));
    });
    let visibleNodeCount = 0;
    const applyNodeFilter = (
      entry: RenderedTemplateSetting,
      query: string,
      ancestorMatches = false,
    ): number => {
      const matches = entry.node.type === "folder"
        ? entry.node.name.toLocaleLowerCase().includes(query)
        : `${entry.node.name} ${entry.node.content}`.toLocaleLowerCase().includes(query);
      const childAncestorMatches = ancestorMatches ||
        (entry.node.type === "folder" && matches);
      const visibleChildren = entry.children.reduce(
        (total, child) => total + applyNodeFilter(child, query, childAncestorMatches),
        0,
      );
      const visible = !query || ancestorMatches || matches || visibleChildren > 0;
      if (visible) visibleNodeCount++;
      entry.element.toggleClass("is-hidden", !visible);
      entry.body?.toggleClass(
        "is-hidden",
        !visible || (entry.isCollapsed() && !query),
      );
      return entry.node.type === "template" ? (visible ? 1 : 0) : visibleChildren;
    };

    applyFilter = () => {
      const query = this.templateSearch.trim().toLocaleLowerCase();
      visibleNodeCount = 0;
      const visible = rendered.reduce(
        (total, entry) => total + applyNodeFilter(entry, query),
        0,
      );
      const total = countTemplates(this.plugin.settings.formulaPanelTemplates);
      summaryEl.setText(t("templateCount", String(visible), String(total)));
      emptyEl.toggleClass("is-hidden", visibleNodeCount !== 0 || !query);
      const hasNodes = this.plugin.settings.formulaPanelTemplates.length > 0;
      treeEl.toggleClass("is-empty", !hasNodes);
      treeEmptyEl.toggleClass("is-hidden", hasNodes);
      rootDropEl.toggleClass("is-hidden", !hasNodes);
    };
    applyFilter();
  }

  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    this.previewCleanup?.();
    this.previewCleanup = null;
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
      .setName(t("inlinePreviewName"))
      .setDesc(t("inlinePreviewDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInlinePreview).onChange(async (value) => {
          this.plugin.settings.showInlinePreview = value;
          this.plugin.refreshInteractiveState();
          await runWithNotice(() => this.plugin.saveSettings(), t("noticeCouldNotSaveSettings"));
        }),
      );

    const tikzGroupEl = containerEl.createDiv({
      cls: "obsidian-math-chords-settings-group",
    });
    this.configureTikzRenderingToggle(new Setting(tikzGroupEl));

    if (this.plugin.settings.tikzRenderingEnabled) {
      const tikzNestedEl = tikzGroupEl.createDiv({
        cls: "obsidian-math-chords-settings-nested",
      });
      this.configureTikzLivePreview(new Setting(tikzNestedEl));
      if (this.plugin.settings.tikzLivePreview) {
        this.configureTikzDebounce(new Setting(tikzNestedEl));
      }
      this.configureTikzLanguage(new Setting(tikzNestedEl));
      this.configureTikzBackend(new Setting(tikzNestedEl));
      if (this.plugin.settings.tikzBackend !== "wasm") {
        this.configureTikzNativePath(new Setting(tikzNestedEl));
      }
      this.configureTikzCustomFontsToggle(new Setting(tikzNestedEl));
      if (this.plugin.settings.tikzCustomFontsEnabled) {
        this.configureTikzFont(
          new Setting(tikzNestedEl),
          "tikzLatinFont",
          "Latin font",
          "Latin Modern Roman",
        );
        this.configureTikzFont(
          new Setting(tikzNestedEl),
          "tikzSimplifiedChineseFont",
          "简体中文字体",
          "Noto Serif CJK SC",
        );
        this.configureTikzFont(
          new Setting(tikzNestedEl),
          "tikzTraditionalChineseFont",
          "繁體中文字型",
          "Noto Serif CJK TC",
        );
        this.configureTikzFont(
          new Setting(tikzNestedEl),
          "tikzJapaneseFont",
          "日本語フォント",
          "Source Han Serif JP",
        );
        this.configureTikzFont(
          new Setting(tikzNestedEl),
          "tikzKoreanFont",
          "한국어 글꼴",
          "Source Han Serif KR",
        );
      }
      this.configureTikzDiagnostics(new Setting(tikzNestedEl));
    }

    new Setting(containerEl)
      .setName(t("formulaPanelEnabledName"))
      .setDesc(t("formulaPanelEnabledDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.formulaPanelEnabled).onChange(async (value) => {
          this.plugin.settings.formulaPanelEnabled = value;
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
          this.refreshSettingsView();
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

    this.renderEnvironmentManager(containerEl);

    this.configureReloadSetting(new Setting(containerEl));

    this.renderShortcutManager(containerEl);
    this.renderTemplateManager(containerEl);
  }

  hide(): void {
    this.previewCleanup?.();
    this.previewCleanup = null;
    super.hide();
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
    this.setTitle(this.heading);
    contentEl.empty();
    contentEl.createEl("p", {
      cls: "obsidian-math-chords-confirm-description",
      text: this.description,
    });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText(t("cancelButton")).onClick(() => this.close()))
      .addButton((button) =>
        button.setButtonText(t("deleteButton")).onClick(() => {
            this.close();
            this.onConfirm();
          }).then((component) => component.buttonEl.addClass("mod-warning")),
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
    this.setTitle(this.initial ? t("editShortcutHeading") : t("addShortcutHeading"));
    contentEl.empty();

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
    this.setTitle(this.initial ? t("editMathEnvHeading") : t("addMathEnvHeading"));
    contentEl.empty();

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
