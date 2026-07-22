import { Component, ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import {
  areAllFormulaPanelGroupsCollapsed,
  groupFormulaPanelShortcuts,
  mathEnvironmentMatchesSearch,
  orderFormulaPanelGroups,
  reorderFormulaPanelGroups,
} from "./formulaPanelModel";
import { t } from "./l10n/locale";
import type ObsidianMathChordsPlugin from "./main";
import { runWithNotice } from "./errors";
import {
  buildMathEnvironmentPreview,
  shortcutMatchesSearch,
} from "./shortcutPresentation";
import {
  scheduleShortcutPreviews,
  type ShortcutPreviewRequest,
} from "./shortcutPreviewRenderer";
import { FORMULA_PANEL_ENVIRONMENT_GROUP_ID } from "./settings";
import type {
  FormulaPanelSectionId,
  MathEnvironment,
  Shortcut,
} from "./types";
import {
  areAllFormulaTemplateNodesCollapsed,
  appendFormulaTemplate,
  appendFormulaTemplateFolder,
  createFormulaTemplate,
  createFormulaTemplateFolder,
} from "./formulaTemplateModel";
import {
  openFormulaTemplateEditorModal,
  openFormulaTemplateFolderModal,
  renderFormulaTemplateTree,
} from "./formulaTemplatePanel";
import {
  encodeFormulaPanelDragPayload,
  FORMULA_PANEL_INSERT_MIME,
  type FormulaPanelDragPayload,
} from "./formulaPanelDrag";

export const FORMULA_PANEL_VIEW_TYPE = "math-chords-formula-panel";

interface RenderedFormula {
  matchesSearch: (query: string) => boolean;
  buttonEl: HTMLButtonElement;
}

interface FormulaPanelDisplayGroup {
  id: string;
  name: string;
  shortcuts: Shortcut[];
  environments: MathEnvironment[];
}

function preserveEditorFocusOnMouseDown(buttonEl: HTMLButtonElement): void {
  buttonEl.addEventListener("pointerdown", (event) => {
    if (event.button === 0) event.stopPropagation();
  });
  buttonEl.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (!buttonEl.draggable) event.preventDefault();
    event.stopPropagation();
  });
}

function makeFormulaPanelItemDraggable(
  buttonEl: HTMLButtonElement,
  payload: FormulaPanelDragPayload,
  plainText: string,
  onDragEnd: () => void,
): void {
  buttonEl.draggable = true;
  buttonEl.addEventListener("dragstart", (event) => {
    if (!event.dataTransfer) return;
    buttonEl.addClass("is-dragging");
    event.dataTransfer.setData(
      FORMULA_PANEL_INSERT_MIME,
      encodeFormulaPanelDragPayload(payload),
    );
    event.dataTransfer.setData("text/plain", plainText);
    event.dataTransfer.effectAllowed = "copy";
  });
  buttonEl.addEventListener("dragend", () => {
    buttonEl.removeClass("is-dragging");
    onDragEnd();
  });
}

interface RenderedFormulaGroup {
  id: string;
  sectionEl: HTMLElement;
  countEl: HTMLElement;
  gridEl: HTMLElement;
  collapseButton: HTMLButtonElement;
  collapsed: boolean;
  formulas: RenderedFormula[];
}

export class FormulaPanelView extends ItemView {
  private search = "";
  private previewCleanup: (() => void) | null = null;
  private templateRenderComponent: Component | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ObsidianMathChordsPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return FORMULA_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("formulaPanelTitle");
  }

  getIcon(): string {
    return "sigma";
  }

  protected async onOpen(): Promise<void> {
    this.render();
  }

  protected async onClose(): Promise<void> {
    this.previewCleanup?.();
    this.previewCleanup = null;
    this.templateRenderComponent?.unload();
    this.templateRenderComponent = null;
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.previewCleanup?.();
    this.previewCleanup = null;
    this.templateRenderComponent?.unload();
    const templateRenderComponent = new Component();
    templateRenderComponent.load();
    this.templateRenderComponent = templateRenderComponent;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("obsidian-math-chords-formula-panel");

    const searchWrap = contentEl.createDiv({
      cls: "obsidian-math-chords-formula-panel-search",
    });
    const searchIcon = searchWrap.createSpan({
      cls: "obsidian-math-chords-formula-panel-search-icon",
    });
    setIcon(searchIcon, "search");
    const searchEl = searchWrap.createEl("input", {
      cls: "obsidian-math-chords-formula-panel-search-input",
      attr: {
        type: "text",
        role: "searchbox",
        placeholder: t("searchPlaceholder"),
        "aria-label": t("searchName"),
      },
    });
    searchEl.value = this.search;

    const summaryBarEl = contentEl.createDiv({
      cls: "obsidian-math-chords-formula-panel-summary-bar",
    });
    const summaryEl = summaryBarEl.createDiv({
      cls: "obsidian-math-chords-formula-panel-summary",
    });
    summaryEl.setAttr("aria-live", "polite");
    const toggleAllButton = summaryBarEl.createEl("button", {
      cls: "clickable-icon obsidian-math-chords-formula-panel-toggle-all",
      attr: { type: "button" },
    });
    preserveEditorFocusOnMouseDown(toggleAllButton);
    const sectionsEl = contentEl.createDiv({
      cls: "obsidian-math-chords-formula-panel-sections",
    });
    const sectionBodies = new Map<FormulaPanelSectionId, HTMLElement>();
    const sectionElements = new Map<FormulaPanelSectionId, HTMLElement>();
    const sectionCollapseButtons = new Map<FormulaPanelSectionId, HTMLButtonElement>();
    const collapsedSections = new Set(this.plugin.settings.formulaPanelCollapsedSections);
    const sectionOrder = [...this.plugin.settings.formulaPanelSectionOrder];
    let sectionDragFrom: number | null = null;

    const setSectionCollapsed = (
      sectionId: FormulaPanelSectionId,
      collapsed: boolean,
    ): void => {
      const bodyEl = sectionBodies.get(sectionId);
      const buttonEl = sectionCollapseButtons.get(sectionId);
      if (!bodyEl || !buttonEl) return;
      const label = t(collapsed ? "expandGroup" : "collapseGroup");
      bodyEl.toggleClass("is-hidden", collapsed && !this.search.trim());
      buttonEl.setAttrs({
        title: label,
        "aria-label": label,
        "aria-expanded": String(!collapsed),
      });
      setIcon(buttonEl, collapsed ? "chevron-right" : "chevron-down");
    };

    for (let sectionIndex = 0; sectionIndex < sectionOrder.length; sectionIndex++) {
      const sectionId = sectionOrder[sectionIndex];
      const sectionEl = sectionsEl.createEl("section", {
        cls: "obsidian-math-chords-formula-panel-section",
      });
      sectionElements.set(sectionId, sectionEl);
      const headerEl = sectionEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-section-heading",
      });
      const labelEl = headerEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-section-label",
      });
      const dragButton = labelEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
        attr: {
          type: "button",
          draggable: "true",
          title: t("dragToReorder"),
          "aria-label": t("dragToReorder"),
        },
      });
      setIcon(dragButton, "grip-vertical");
      labelEl.createEl("h3", {
        cls: "obsidian-math-chords-formula-panel-section-title",
        text: t(sectionId === "shortcuts"
          ? "formulaPanelShortcutsSection"
          : "formulaPanelTemplatesSection"),
      });
      const controlsEl = headerEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-group-controls",
      });
      if (sectionId === "templates") {
        const addButton = controlsEl.createEl("button", {
          cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
          attr: {
            type: "button",
            title: t("addTemplateFolder"),
            "aria-label": t("addTemplateFolder"),
          },
        });
        preserveEditorFocusOnMouseDown(addButton);
        setIcon(addButton, "folder-plus");
        addButton.addEventListener("click", (event) => {
          event.stopPropagation();
          openFormulaTemplateFolderModal(this.app, (name) => {
            void runWithNotice(
              () => this.plugin.updateFormulaPanelTemplates(
                appendFormulaTemplateFolder(
                  this.plugin.settings.formulaPanelTemplates,
                  null,
                  createFormulaTemplateFolder(name),
                ),
              ),
              t("noticeCouldNotSaveSettings"),
            );
          });
        });
        const addTemplateButton = controlsEl.createEl("button", {
          cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
          attr: {
            type: "button",
            title: t("addTemplate"),
            "aria-label": t("addTemplate"),
          },
        });
        preserveEditorFocusOnMouseDown(addTemplateButton);
        setIcon(addTemplateButton, "file-plus");
        addTemplateButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const template = createFormulaTemplate();
          openFormulaTemplateEditorModal(this.app, template, (updated) => {
            void runWithNotice(
              () => this.plugin.updateFormulaPanelTemplates(
                appendFormulaTemplate(
                  this.plugin.settings.formulaPanelTemplates,
                  null,
                  { ...template, ...updated },
                ),
              ),
              t("noticeCouldNotSaveSettings"),
            );
          });
        });
      }
      const collapseButton = controlsEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
        attr: { type: "button" },
      });
      preserveEditorFocusOnMouseDown(collapseButton);
      sectionCollapseButtons.set(sectionId, collapseButton);
      const bodyEl = sectionEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-section-body",
      });
      sectionBodies.set(sectionId, bodyEl);
      setSectionCollapsed(sectionId, collapsedSections.has(sectionId));

      collapseButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const collapsed = !collapsedSections.has(sectionId);
        if (collapsed) collapsedSections.add(sectionId);
        else collapsedSections.delete(sectionId);
        setSectionCollapsed(sectionId, collapsed);
        void runWithNotice(
          () => this.plugin.setFormulaPanelSectionCollapsed(sectionId, collapsed),
          t("noticeCouldNotSaveSettings"),
        );
      });
      const reorderSection = (to: number): void => {
        if (to < 0 || to >= sectionOrder.length || to === sectionIndex) return;
        const order = reorderFormulaPanelGroups(sectionOrder, sectionIndex, to);
        void runWithNotice(
          () => this.plugin.updateFormulaPanelSectionOrder(order),
          t("noticeCouldNotSaveSettings"),
        );
      };
      dragButton.addEventListener("dragstart", (event) => {
        sectionDragFrom = sectionIndex;
        sectionEl.addClass("is-dragging");
        event.dataTransfer?.setData("application/x-math-chords-panel-section", sectionId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      dragButton.addEventListener("dragend", () => {
        sectionDragFrom = null;
        sectionEl.removeClass("is-dragging");
        sectionElements.forEach((element) => element.removeClass("is-drop-target"));
      });
      dragButton.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        reorderSection(sectionIndex + (event.key === "ArrowUp" ? -1 : 1));
      });
      sectionEl.addEventListener("dragover", (event) => {
        if (sectionDragFrom === null || sectionDragFrom === sectionIndex) return;
        event.preventDefault();
        sectionEl.addClass("is-drop-target");
      });
      sectionEl.addEventListener("dragleave", () => sectionEl.removeClass("is-drop-target"));
      sectionEl.addEventListener("drop", (event) => {
        if (sectionDragFrom === null) return;
        event.preventDefault();
        sectionEl.removeClass("is-drop-target");
        const order = reorderFormulaPanelGroups(sectionOrder, sectionDragFrom, sectionIndex);
        void runWithNotice(
          () => this.plugin.updateFormulaPanelSectionOrder(order),
          t("noticeCouldNotSaveSettings"),
        );
      });
    }

    const shortcutSectionEl = sectionElements.get("shortcuts");
    const templateSectionEl = sectionElements.get("templates");
    const groupsEl = sectionBodies.get("shortcuts")!.createDiv({
      cls: "obsidian-math-chords-formula-panel-groups",
    });
    const templatesEl = sectionBodies.get("templates")!.createDiv({
      cls: "obsidian-math-chords-template-tree",
    });
    const emptyEl = contentEl.createDiv({
      cls: "obsidian-math-chords-formula-panel-empty is-hidden",
      text: t("noMatchingFormulas"),
    });
    const shortcutGroups = groupFormulaPanelShortcuts(
      this.plugin.shortcuts.values(),
      t("ungroupedGroup"),
    );
    const groups = orderFormulaPanelGroups<FormulaPanelDisplayGroup>(
      [
        ...shortcutGroups.map((group) => ({ ...group, environments: [] })),
        ...(this.plugin.settings.mathEnvironments.length > 0
          ? [{
              id: FORMULA_PANEL_ENVIRONMENT_GROUP_ID,
              name: t("mathEnvironmentsName"),
              shortcuts: [],
              environments: this.plugin.settings.mathEnvironments,
            }]
          : []),
      ],
      this.plugin.settings.formulaPanelGroupOrder,
    );
    const collapsedGroups = new Set(this.plugin.settings.formulaPanelCollapsedGroups);
    toggleAllButton.disabled = groups.length === 0 &&
      this.plugin.settings.formulaPanelTemplates.length === 0;
    const renderedGroups: RenderedFormulaGroup[] = [];
    const previewRequests: ShortcutPreviewRequest[] = [];
    let dragFrom: number | null = null;

    const reorder = (from: number, to: number): void => {
      if (from === to || from < 0 || to < 0 || from >= groups.length || to >= groups.length) {
        return;
      }
      const order = reorderFormulaPanelGroups(
        groups.map((group) => group.id),
        from,
        to,
      );
      void runWithNotice(
        () => this.plugin.updateFormulaPanelGroupOrder(order),
        t("noticeCouldNotSaveSettings"),
      );
    };

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const sectionEl = groupsEl.createEl("section", {
        cls: "obsidian-math-chords-formula-panel-group",
      });
      const headerEl = sectionEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-heading",
      });
      const labelEl = headerEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-group-label",
      });
      const dragButton = labelEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
        attr: {
          type: "button",
          draggable: "true",
          title: t("dragToReorder"),
          "aria-label": t("dragToReorder"),
        },
      });
      setIcon(dragButton, "grip-vertical");
      const headingEl = labelEl.createEl("h4", {
        cls: "obsidian-math-chords-formula-panel-title",
        text: group.name,
      });
      const countEl = headingEl.createSpan({
        cls: "obsidian-math-chords-formula-panel-count",
      });
      const controlsEl = headerEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-group-controls",
      });
      const collapsed = collapsedGroups.has(group.id);
      const collapseButton = controlsEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
        attr: {
          type: "button",
          title: t(collapsed ? "expandGroup" : "collapseGroup"),
          "aria-label": t(collapsed ? "expandGroup" : "collapseGroup"),
          "aria-expanded": String(!collapsed),
        },
      });
      preserveEditorFocusOnMouseDown(collapseButton);
      setIcon(collapseButton, collapsed ? "chevron-right" : "chevron-down");
      const gridEl = sectionEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-grid",
      });
      const formulas: RenderedFormula[] = [];
      const renderedGroup: RenderedFormulaGroup = {
        id: group.id,
        sectionEl,
        countEl,
        gridEl,
        collapseButton,
        collapsed,
        formulas,
      };
      renderedGroups.push(renderedGroup);

      dragButton.addEventListener("dragstart", (event) => {
        dragFrom = groupIndex;
        sectionEl.addClass("is-dragging");
        event.dataTransfer?.setData("text/plain", group.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      dragButton.addEventListener("dragend", () => {
        dragFrom = null;
        for (const section of Array.from(
          groupsEl.querySelectorAll<HTMLElement>(
            ".obsidian-math-chords-formula-panel-group",
          ),
        )) {
          section.removeClass("is-dragging", "is-drop-target");
        }
      });
      dragButton.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        reorder(groupIndex, groupIndex + (event.key === "ArrowUp" ? -1 : 1));
      });
      sectionEl.addEventListener("dragover", (event) => {
        if (dragFrom === null || dragFrom === groupIndex) return;
        event.preventDefault();
        sectionEl.addClass("is-drop-target");
      });
      sectionEl.addEventListener("dragleave", () => {
        sectionEl.removeClass("is-drop-target");
      });
      sectionEl.addEventListener("drop", (event) => {
        event.preventDefault();
        sectionEl.removeClass("is-drop-target");
        if (dragFrom !== null) reorder(dragFrom, groupIndex);
      });
      collapseButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setRenderedGroupCollapsed(renderedGroup, !renderedGroup.collapsed);
        updateToggleAllButton();
        void runWithNotice(
          () =>
            this.plugin.setFormulaPanelGroupCollapsed(group.id, renderedGroup.collapsed),
          t("noticeCouldNotSaveSettings"),
        );
      });

      for (const environment of group.environments) {
        const label = environment.name;
        const buttonEl = gridEl.createEl("button", {
          cls: "obsidian-math-chords-formula-panel-item",
          attr: {
            type: "button",
            title: `${label} — ${environment.begin}`,
            "aria-label": label,
          },
        });
        preserveEditorFocusOnMouseDown(buttonEl);
        makeFormulaPanelItemDraggable(
          buttonEl,
          { kind: "environment", environment },
          `${environment.begin}\n\n${environment.end}`,
          () => this.plugin.clearFormulaPanelDropCursors(),
        );
        const previewEl = buttonEl.createDiv({
          cls: "obsidian-math-chords-formula-panel-preview",
        });
        previewEl.setAttr("aria-hidden", "true");
        previewEl.createSpan({
          cls: "obsidian-math-chords-shortcut-preview-loading",
          text: "—",
        });
        buttonEl.createDiv({
          cls: "obsidian-math-chords-formula-panel-name",
          text: label,
        });
        buttonEl.addEventListener("click", (event) => {
          event.stopPropagation();
          this.plugin.insertMathEnvironmentFromFormulaPanel(environment);
        });
        previewRequests.push({
          containerEl: previewEl,
          latex: buildMathEnvironmentPreview(environment),
        });
        formulas.push({
          buttonEl,
          matchesSearch: (query) =>
            mathEnvironmentMatchesSearch(environment, group.name, query),
        });
      }

      for (const shortcut of group.shortcuts) {
        const label = shortcut.name?.trim() || t("unnamedShortcut");
        const buttonEl = gridEl.createEl("button", {
          cls: "obsidian-math-chords-formula-panel-item",
          attr: {
            type: "button",
            title: `${label} — ${shortcut.command}`,
            "aria-label": label,
          },
        });
        preserveEditorFocusOnMouseDown(buttonEl);
        makeFormulaPanelItemDraggable(
          buttonEl,
          { kind: "shortcut", shortcut },
          shortcut.command === "__DISPLAY_MATH__" ? "$$\n\n$$" : shortcut.command,
          () => this.plugin.clearFormulaPanelDropCursors(),
        );
        const previewEl = buttonEl.createDiv({
          cls: "obsidian-math-chords-formula-panel-preview",
        });
        previewEl.setAttr("aria-hidden", "true");
        previewEl.createSpan({
          cls: "obsidian-math-chords-shortcut-preview-loading",
          text: "—",
        });
        buttonEl.createDiv({
          cls: "obsidian-math-chords-formula-panel-name",
          text: label,
        });
        buttonEl.addEventListener("click", (event) => {
          event.stopPropagation();
          this.plugin.insertShortcutFromFormulaPanel(shortcut);
        });
        previewRequests.push({ containerEl: previewEl, command: shortcut.command });
        formulas.push({
          buttonEl,
          matchesSearch: (query) => shortcutMatchesSearch(shortcut, query),
        });
      }
    }

    const renderedTemplateTree = renderFormulaTemplateTree(templatesEl, {
      app: this.app,
      roots: this.plugin.settings.formulaPanelTemplates,
      sourcePath: this.app.workspace.getActiveFile()?.path ?? "",
      renderComponent: templateRenderComponent,
      onInsert: (content) => this.plugin.insertTemplateFromFormulaPanel(content),
      onDragEnd: () => this.plugin.clearFormulaPanelDropCursors(),
      onChange: (templates) => {
        void runWithNotice(
          () => this.plugin.updateFormulaPanelTemplates(templates),
          t("noticeCouldNotSaveSettings"),
        );
      },
    });
    if (renderedTemplateTree.total === 0) {
      templatesEl.createDiv({
        cls: "obsidian-math-chords-template-tree-empty",
        text: t("templateSectionEmptyHint"),
      });
    }

    const setRenderedGroupCollapsed = (
      group: RenderedFormulaGroup,
      collapsed: boolean,
    ): void => {
      group.collapsed = collapsed;
      const label = t(collapsed ? "expandGroup" : "collapseGroup");
      group.collapseButton.setAttrs({
        title: label,
        "aria-label": label,
        "aria-expanded": String(!collapsed),
      });
      setIcon(group.collapseButton, collapsed ? "chevron-right" : "chevron-down");
      const searching = this.search.trim().length > 0;
      group.gridEl.toggleClass("is-hidden", collapsed && !searching);
    };

    const updateToggleAllButton = (): boolean => {
      const collapseStates: boolean[] = [];
      if (renderedGroups.length > 0) {
        collapseStates.push(areAllFormulaPanelGroupsCollapsed(
          renderedGroups.map((group) => group.id),
          renderedGroups.filter((group) => group.collapsed).map((group) => group.id),
        ));
      }
      if (this.plugin.settings.formulaPanelTemplates.length > 0) {
        collapseStates.push(areAllFormulaTemplateNodesCollapsed(
          this.plugin.settings.formulaPanelTemplates,
        ));
      }
      const allCollapsed = collapseStates.length > 0 && collapseStates.every(Boolean);
      const label = t(allCollapsed ? "expandAllGroups" : "collapseAllGroups");
      toggleAllButton.setAttrs({ title: label, "aria-label": label });
      setIcon(toggleAllButton, allCollapsed ? "chevrons-up-down" : "chevrons-down-up");
      return allCollapsed;
    };

    toggleAllButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const collapseAll = !updateToggleAllButton();
      void runWithNotice(
        () =>
          this.plugin.setAllFormulaPanelGroupsCollapsed(
            renderedGroups.map((group) => group.id),
            collapseAll,
          ),
        t("noticeCouldNotSaveSettings"),
      );
    });
    updateToggleAllButton();

    const applyFilter = (): void => {
      this.search = searchEl.value;
      const searching = this.search.trim().length > 0;
      let visibleShortcutTotal = 0;
      for (const group of renderedGroups) {
        let visible = 0;
        for (const formula of group.formulas) {
          const matches = formula.matchesSearch(this.search);
          formula.buttonEl.toggleClass("is-hidden", !matches);
          if (matches) visible++;
        }
        group.sectionEl.toggleClass("is-hidden", visible === 0);
        group.gridEl.toggleClass("is-hidden", visible === 0 || (group.collapsed && !searching));
        group.countEl.setText(String(visible));
        visibleShortcutTotal += visible;
      }
      const visibleTemplateTotal = renderedTemplateTree.applyFilter(this.search);
      const visibleTotal = visibleShortcutTotal + visibleTemplateTotal;
      shortcutSectionEl?.toggleClass("is-hidden", searching && visibleShortcutTotal === 0);
      templateSectionEl?.toggleClass("is-hidden", searching && visibleTemplateTotal === 0);
      const shortcutBody = sectionBodies.get("shortcuts");
      const templateBody = sectionBodies.get("templates");
      shortcutBody?.toggleClass(
        "is-hidden",
        collapsedSections.has("shortcuts") && !searching,
      );
      templateBody?.toggleClass(
        "is-hidden",
        collapsedSections.has("templates") && !searching,
      );
      const total = this.plugin.shortcuts.size +
        this.plugin.settings.mathEnvironments.length +
        renderedTemplateTree.total;
      summaryEl.setText(t("formulaPanelItemCount", String(visibleTotal), String(total)));
      emptyEl.toggleClass("is-hidden", visibleTotal !== 0);
    };

    searchEl.addEventListener("input", applyFilter);
    applyFilter();
    this.previewCleanup = scheduleShortcutPreviews(previewRequests, contentEl);
  }
}
