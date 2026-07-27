import {
  App,
  Component,
  MarkdownRenderer,
  Modal,
  Setting,
  setIcon,
} from "obsidian";
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
import { t } from "./l10n/locale";
import type {
  FormulaTemplate,
  FormulaTemplateNode,
} from "./types";
import {
  encodeFormulaPanelDragPayload,
  FORMULA_PANEL_INSERT_MIME,
} from "./formulaPanelDrag";

const TEMPLATE_NODE_MIME = "application/x-math-chords-template-node";

interface TemplateTreeOptions {
  app: App;
  roots: FormulaTemplateNode[];
  sourcePath: string;
  renderComponent: Component;
  onChange: (roots: FormulaTemplateNode[]) => void;
  onInsert?: (template: FormulaTemplate) => void;
  onDragEnd?: () => void;
}

interface RenderedTemplateNode {
  node: FormulaTemplateNode;
  element: HTMLElement;
  body: HTMLElement;
  children: RenderedTemplateNode[];
}

export interface RenderedTemplateTree {
  total: number;
  applyFilter: (query: string) => number;
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

function templateCount(nodes: FormulaTemplateNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.type === "template" ? 1 : templateCount(node.children)),
    0,
  );
}

export function renderFormulaTemplateTree(
  containerEl: HTMLElement,
  options: TemplateTreeOptions,
): RenderedTemplateTree {
  const renderedRoots: RenderedTemplateNode[] = [];
  let dragId: string | null = null;

  const clearDropIndicators = (): void => {
    containerEl
      .querySelectorAll<HTMLElement>(".is-drop-before, .is-drop-after, .is-drop-inside")
      .forEach((element) =>
        element.removeClass("is-drop-before", "is-drop-after", "is-drop-inside"),
      );
  };

  const persist = (roots: FormulaTemplateNode[]): void => {
    if (roots !== options.roots) options.onChange(roots);
  };

  const renderNodes = (
    parentEl: HTMLElement,
    nodes: FormulaTemplateNode[],
    parentId: string | null,
  ): RenderedTemplateNode[] =>
    nodes.map((node, index) => {
      const nodeEl = parentEl.createDiv({
        cls: `obsidian-math-chords-template-node is-${node.type}`,
      });
      const headerEl = nodeEl.createDiv({
        cls: "obsidian-math-chords-template-node-header",
      });
      const labelEl = headerEl.createDiv({
        cls: "obsidian-math-chords-template-node-label",
      });
      const dragButton = labelEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-template-icon-button",
        attr: {
          type: "button",
          draggable: "true",
          title: t("dragToReorder"),
          "aria-label": t("dragToReorder"),
        },
      });
      setIcon(dragButton, "grip-vertical");
      const kindIcon = labelEl.createSpan({
        cls: "obsidian-math-chords-template-kind-icon",
      });
      setIcon(kindIcon, node.type === "folder" ? "folder" : "file-text");
      const nodeLabel = node.type === "folder"
        ? node.name || t("newTemplateFolderName")
        : node.name || formulaTemplateLabel(node.content, t("untitledTemplate"));
      const nameEl = labelEl.createDiv({
        cls: "obsidian-math-chords-template-node-name",
        text: nodeLabel,
        attr: { title: nodeLabel },
      });
      const controlsEl = headerEl.createDiv({
        cls: "obsidian-math-chords-template-node-controls",
      });
      const addDeleteButton = (heading: string, description: string): void => {
        const deleteButton = controlsEl.createEl("button", {
          cls: "clickable-icon obsidian-math-chords-template-icon-button is-destructive",
          attr: {
            type: "button",
            title: t("deleteButton"),
            "aria-label": t("deleteButton"),
          },
        });
        preserveEditorFocusOnMouseDown(deleteButton);
        setIcon(deleteButton, "trash-2");
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          new FormulaTemplateDeleteModal(
            options.app,
            heading,
            description,
            () => persist(removeFormulaTemplateNode(options.roots, node.id)),
          ).open();
        });
      };

      if (node.type === "folder") {
        const addButton = controlsEl.createEl("button", {
          cls: "clickable-icon obsidian-math-chords-template-icon-button",
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
          new FormulaTemplateFolderModal(options.app, (name) => {
            persist(appendFormulaTemplateFolder(
              options.roots,
              node.id,
              createFormulaTemplateFolder(name),
            ));
          }).open();
        });
        const addTemplateButton = controlsEl.createEl("button", {
          cls: "clickable-icon obsidian-math-chords-template-icon-button",
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
          openFormulaTemplateEditorModal(options.app, template, (updated) => {
            persist(appendFormulaTemplate(
              options.roots,
              node.id,
              { ...template, ...updated },
            ));
          });
        });
        addDeleteButton(
          t("deleteTemplateFolderHeading"),
          t("deleteTemplateFolderDesc", nodeLabel),
        );
      } else {
        const favoriteButton = controlsEl.createEl("button", {
          cls: `clickable-icon obsidian-math-chords-template-icon-button${
            node.favorite ? " is-favorite" : ""
          }`,
          attr: {
            type: "button",
            title: t(node.favorite ? "unfavoriteTemplate" : "favoriteTemplate"),
            "aria-label": t(
              node.favorite ? "unfavoriteTemplate" : "favoriteTemplate",
            ),
            "aria-pressed": String(node.favorite),
          },
        });
        preserveEditorFocusOnMouseDown(favoriteButton);
        setIcon(favoriteButton, "star");
        favoriteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          persist(
            updateFormulaTemplateNode(options.roots, node.id, (current) =>
              current.type === "template"
                ? { ...current, favorite: !current.favorite }
                : current,
            ),
          );
        });
        const editButton = controlsEl.createEl("button", {
          cls: "clickable-icon obsidian-math-chords-template-icon-button",
          attr: {
            type: "button",
            title: t("editTemplate"),
            "aria-label": t("editTemplate"),
          },
        });
        preserveEditorFocusOnMouseDown(editButton);
        setIcon(editButton, "pencil");
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          openFormulaTemplateEditorModal(options.app, node, (updated) => {
            persist(updateFormulaTemplateNode(options.roots, node.id, (current) =>
              current.type === "template" ? { ...current, ...updated } : current,
            ));
          });
        });
        addDeleteButton(
          t("deleteTemplateHeading"),
          t("deleteTemplateDesc", nodeLabel),
        );
      }

      const collapseButton = controlsEl.createEl("button", {
        cls: "clickable-icon obsidian-math-chords-template-icon-button",
        attr: {
          type: "button",
          title: t(node.collapsed ? "expandGroup" : "collapseGroup"),
          "aria-label": t(node.collapsed ? "expandGroup" : "collapseGroup"),
          "aria-expanded": String(!node.collapsed),
        },
      });
      preserveEditorFocusOnMouseDown(collapseButton);
      setIcon(collapseButton, node.collapsed ? "chevron-right" : "chevron-down");

      const bodyEl = nodeEl.createDiv({
        cls: "obsidian-math-chords-template-node-body",
      });
      bodyEl.toggleClass("is-hidden", node.collapsed);
      const renderedChildren = node.type === "folder"
        ? renderNodes(bodyEl, node.children, node.id)
        : [];
      if (node.type === "template") {
        const startInsertDrag = (event: DragEvent): void => {
          event.stopPropagation();
          if (!event.dataTransfer) return;
          nodeEl.addClass("is-dragging");
          event.dataTransfer.setData(
            FORMULA_PANEL_INSERT_MIME,
            encodeFormulaPanelDragPayload({
              kind: "template",
              id: node.id,
              content: node.content,
            }),
          );
          event.dataTransfer.setData("text/plain", node.content);
          event.dataTransfer.effectAllowed = "copy";
        };
        const endInsertDrag = (): void => {
          nodeEl.removeClass("is-dragging");
          options.onDragEnd?.();
        };
        nameEl.draggable = true;
        bodyEl.draggable = true;
        nameEl.addClass("is-insert-draggable");
        bodyEl.addClass("is-insert-draggable");
        nameEl.addEventListener("dragstart", startInsertDrag);
        bodyEl.addEventListener("dragstart", startInsertDrag);
        nameEl.addEventListener("dragend", endInsertDrag);
        bodyEl.addEventListener("dragend", endInsertDrag);
        bodyEl.addClass("obsidian-math-chords-template-preview", "markdown-rendered");
        bodyEl.setAttrs({
          role: "button",
          tabindex: "0",
          title: t("insertTemplate"),
          "aria-label": t("insertTemplate"),
        });
        const insert = (event?: Event): void => {
          event?.preventDefault();
          event?.stopPropagation();
          options.onInsert?.(node);
        };
        nameEl.addEventListener("click", insert);
        bodyEl.addEventListener("click", insert);
        bodyEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          insert(event);
        });
        if (!node.content.trim()) {
          bodyEl.createDiv({
            cls: "obsidian-math-chords-template-empty",
            text: t("templateEmptyHint"),
          });
        } else {
          void MarkdownRenderer.render(
            options.app,
            node.content,
            bodyEl,
            options.sourcePath,
            options.renderComponent,
          );
        }
      }

      collapseButton.addEventListener("click", (event) => {
        event.stopPropagation();
        persist(updateFormulaTemplateNode(options.roots, node.id, (current) => ({
          ...current,
          collapsed: !current.collapsed,
        })));
      });

      dragButton.addEventListener("dragstart", (event) => {
        dragId = node.id;
        nodeEl.addClass("is-dragging");
        event.dataTransfer?.setData(TEMPLATE_NODE_MIME, node.id);
        if (node.type === "template") {
          event.dataTransfer?.setData(
            FORMULA_PANEL_INSERT_MIME,
            encodeFormulaPanelDragPayload({
              kind: "template",
              id: node.id,
              content: node.content,
            }),
          );
          event.dataTransfer?.setData("text/plain", node.content);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
        } else if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });
      dragButton.addEventListener("dragend", () => {
        dragId = null;
        nodeEl.removeClass("is-dragging");
        clearDropIndicators();
        options.onDragEnd?.();
      });
      dragButton.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        persist(moveFormulaTemplateNode(
          options.roots,
          node.id,
          parentId,
          index + (event.key === "ArrowUp" ? -1 : 2),
        ));
      });

      headerEl.addEventListener("dragover", (event) => {
        if (!dragId || dragId === node.id) return;
        event.preventDefault();
        event.stopPropagation();
        clearDropIndicators();
        const bounds = headerEl.getBoundingClientRect();
        const ratio = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0;
        if (node.type === "folder" && ratio >= 0.25 && ratio <= 0.75) {
          nodeEl.addClass("is-drop-inside");
        } else {
          nodeEl.addClass(ratio < 0.5 ? "is-drop-before" : "is-drop-after");
        }
      });
      headerEl.addEventListener("dragleave", (event) => {
        if (!nodeEl.contains(event.relatedTarget as Node | null)) clearDropIndicators();
      });
      headerEl.addEventListener("drop", (event) => {
        if (!dragId || dragId === node.id) return;
        event.preventDefault();
        event.stopPropagation();
        const inside = nodeEl.hasClass("is-drop-inside") && node.type === "folder";
        const after = nodeEl.hasClass("is-drop-after");
        clearDropIndicators();
        persist(moveFormulaTemplateNode(
          options.roots,
          dragId,
          inside ? node.id : parentId,
          inside ? node.children.length : index + (after ? 1 : 0),
        ));
      });

      return {
        node,
        element: nodeEl,
        body: bodyEl,
        children: renderedChildren,
      };
    });

  renderedRoots.push(...renderNodes(containerEl, options.roots, null));
  containerEl.addEventListener("dragover", (event) => {
    if (!dragId || event.target !== containerEl) return;
    event.preventDefault();
    containerEl.addClass("is-root-drop-target");
  });
  containerEl.addEventListener("dragleave", () => {
    containerEl.removeClass("is-root-drop-target");
  });
  containerEl.addEventListener("drop", (event) => {
    if (!dragId || event.target !== containerEl) return;
    event.preventDefault();
    containerEl.removeClass("is-root-drop-target");
    persist(moveFormulaTemplateNode(options.roots, dragId, null, options.roots.length));
  });

  const applyNodeFilter = (
    rendered: RenderedTemplateNode,
    query: string,
    ancestorMatches = false,
  ): number => {
    const matches = rendered.node.type === "folder"
      ? rendered.node.name.toLocaleLowerCase().includes(query)
      : `${rendered.node.name} ${rendered.node.content}`
          .toLocaleLowerCase()
          .includes(query);
    const childAncestorMatches = ancestorMatches ||
      (rendered.node.type === "folder" && matches);
    const childVisible = rendered.children.reduce(
      (total, child) => total + applyNodeFilter(child, query, childAncestorMatches),
      0,
    );
    const visible = !query || ancestorMatches || matches || childVisible > 0;
    rendered.element.toggleClass("is-hidden", !visible);
    const searching = query.length > 0;
    rendered.body.toggleClass("is-hidden", !visible || (rendered.node.collapsed && !searching));
    if (rendered.node.type === "template") return visible ? 1 : 0;
    return childVisible;
  };

  return {
    total: templateCount(options.roots),
    applyFilter: (rawQuery) => {
      const query = rawQuery.trim().toLocaleLowerCase();
      return renderedRoots.reduce(
        (total, rendered) => total + applyNodeFilter(rendered, query),
        0,
      );
    },
  };
}

export function openFormulaTemplateFolderModal(
  app: App,
  onSave: (name: string) => void,
  initialName = "",
): void {
  new FormulaTemplateFolderModal(app, onSave, initialName).open();
}

export function openFormulaTemplateEditorModal(
  app: App,
  initial: FormulaTemplate,
  onSave: (template: Pick<FormulaTemplate, "name" | "content">) => void,
): void {
  new FormulaTemplateEditorModal(app, initial, onSave).open();
}

class FormulaTemplateDeleteModal extends Modal {
  constructor(
    app: App,
    private readonly heading: string,
    private readonly description: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.heading);
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "obsidian-math-chords-confirm-description",
      text: this.description,
    });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText(t("cancelButton"))
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText(t("deleteButton"))
        .onClick(() => {
          this.close();
          this.onConfirm();
        })
        .then((component) => component.buttonEl.addClass("mod-warning")));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class FormulaTemplateFolderModal extends Modal {
  private name: string;

  constructor(
    app: App,
    private readonly onSave: (name: string) => void,
    initialName = "",
  ) {
    super(app);
    this.name = initialName;
  }

  onOpen(): void {
    this.setTitle(t(this.name ? "editTemplateFolder" : "addTemplateFolder"));
    this.contentEl.empty();
    new Setting(this.contentEl)
      .setName(t("tableName"))
      .addText((text) => {
        text.setValue(this.name).setPlaceholder(t("newTemplateFolderName")).onChange((value) => {
          this.name = value;
        });
        this.contentEl.ownerDocument.defaultView?.setTimeout(() => text.inputEl.focus());
      });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText(t(this.name ? "saveButton" : "addButton"))
        .setCta()
        .onClick(() => {
          this.onSave(this.name.trim() || t("newTemplateFolderName"));
          this.close();
        }))
      .addButton((button) => button
        .setButtonText(t("cancelButton"))
        .onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class FormulaTemplateEditorModal extends Modal {
  private name: string;
  private content: string;
  private previewComponent: Component | null = null;

  constructor(
    app: App,
    initial: FormulaTemplate,
    private readonly onSave: (
      template: Pick<FormulaTemplate, "name" | "content">,
    ) => void,
  ) {
    super(app);
    this.name = initial.name;
    this.content = initial.content;
  }

  onOpen(): void {
    this.setTitle(t("templateEditorHeading"));
    this.contentEl.empty();
    const editorEl = this.contentEl.createDiv({
      cls: "obsidian-math-chords-template-editor",
    });
    new Setting(editorEl)
      .setName(t("templateTitleName"))
      .setDesc(t("templateTitleDesc"))
      .addText((text) => text
        .setValue(this.name)
        .setPlaceholder(t("untitledTemplate"))
        .onChange((value) => {
          this.name = value;
        }));
    editorEl.createDiv({
      cls: "setting-item-name",
      text: t("templateMarkdownName"),
    });
    editorEl.createDiv({
      cls: "setting-item-description",
      text: t("templateMarkdownDesc"),
    });
    const textArea = editorEl.createEl("textarea", {
      cls: "obsidian-math-chords-template-editor-textarea",
      attr: { "aria-label": t("templateMarkdownName") },
    });
    textArea.value = this.content;
    const previewEl = editorEl.createDiv({
      cls: "obsidian-math-chords-template-editor-preview markdown-rendered",
    });
    const renderPreview = (): void => {
      this.previewComponent?.unload();
      this.previewComponent = new Component();
      this.previewComponent.load();
      previewEl.empty();
      if (!this.content.trim()) {
        previewEl.createDiv({
          cls: "obsidian-math-chords-template-empty",
          text: t("templateEmptyHint"),
        });
        return;
      }
      void MarkdownRenderer.render(
        this.app,
        this.content,
        previewEl,
        this.app.workspace.getActiveFile()?.path ?? "",
        this.previewComponent,
      );
    };
    textArea.addEventListener("input", () => {
      this.content = textArea.value;
      renderPreview();
    });
    renderPreview();
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText(t("saveButton"))
        .setCta()
        .onClick(() => {
          this.onSave({ name: this.name.trim(), content: this.content });
          this.close();
        }))
      .addButton((button) => button
        .setButtonText(t("cancelButton"))
        .onClick(() => this.close()));
    this.contentEl.ownerDocument.defaultView?.setTimeout(() => textArea.focus());
  }

  onClose(): void {
    this.previewComponent?.unload();
    this.previewComponent = null;
    this.contentEl.empty();
  }
}
