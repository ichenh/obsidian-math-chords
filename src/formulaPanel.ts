import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
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
import type { MathEnvironment, Shortcut } from "./types";

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
    event.preventDefault();
    event.stopPropagation();
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
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.previewCleanup?.();
    this.previewCleanup = null;
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
    const groupsEl = contentEl.createDiv({
      cls: "obsidian-math-chords-formula-panel-groups",
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
    toggleAllButton.disabled = groups.length === 0;
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
      const headingEl = headerEl.createEl("h4", {
        cls: "obsidian-math-chords-formula-panel-title",
        text: group.name,
      });
      const countEl = headingEl.createSpan({
        cls: "obsidian-math-chords-formula-panel-count",
      });
      const controlsEl = headerEl.createDiv({
        cls: "obsidian-math-chords-formula-panel-group-controls",
      });
      const dragButton = controlsEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-formula-panel-group-button",
        attr: {
          type: "button",
          draggable: "true",
          title: t("dragToReorder"),
          "aria-label": t("dragToReorder"),
        },
      });
      setIcon(dragButton, "grip-vertical");
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
      const allCollapsed = areAllFormulaPanelGroupsCollapsed(
        renderedGroups.map((group) => group.id),
        renderedGroups.filter((group) => group.collapsed).map((group) => group.id),
      );
      const label = t(allCollapsed ? "expandAllGroups" : "collapseAllGroups");
      toggleAllButton.setAttrs({ title: label, "aria-label": label });
      setIcon(toggleAllButton, allCollapsed ? "chevrons-up-down" : "chevrons-down-up");
      return allCollapsed;
    };

    toggleAllButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const collapseAll = !updateToggleAllButton();
      for (const group of renderedGroups) setRenderedGroupCollapsed(group, collapseAll);
      updateToggleAllButton();
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
      let visibleTotal = 0;
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
        visibleTotal += visible;
      }
      const total = this.plugin.shortcuts.size + this.plugin.settings.mathEnvironments.length;
      summaryEl.setText(t("formulaPanelItemCount", String(visibleTotal), String(total)));
      emptyEl.toggleClass("is-hidden", visibleTotal !== 0);
    };

    searchEl.addEventListener("input", applyFilter);
    applyFilter();
    this.previewCleanup = scheduleShortcutPreviews(previewRequests, contentEl);
  }
}
