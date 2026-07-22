import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";

export const setFormulaPanelDropPosition = StateEffect.define<number | null>();

class FormulaPanelDropCursorWidget extends WidgetType {
  toDOM(view: EditorView): HTMLElement {
    const ownerWindow = view.dom.win as Window & {
      createFragment: typeof createFragment;
    };
    return ownerWindow.createFragment().createSpan({
      cls: "obsidian-math-chords-editor-drop-cursor",
      attr: { "aria-hidden": "true" },
    });
  }
}

export const formulaPanelDropCursorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setFormulaPanelDropPosition)) continue;
      if (effect.value === null) {
        next = Decoration.none;
      } else {
        const position = Math.max(0, Math.min(effect.value, transaction.state.doc.length));
        next = Decoration.set([
          Decoration.widget({
            widget: new FormulaPanelDropCursorWidget(),
            side: 1,
          }).range(position),
        ]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
