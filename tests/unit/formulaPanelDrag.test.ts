import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  decodeFormulaPanelDragPayload,
  encodeFormulaPanelDragPayload,
} from "../../src/formulaPanelDrag";
import {
  formulaPanelDropCursorField,
  setFormulaPanelDropPosition,
} from "../../src/formulaPanelDropCursor";

describe("formula panel drag payload", () => {
  it("round-trips shortcuts, environments, and Markdown templates", () => {
    const payloads = [
      { kind: "shortcut" as const, shortcut: { keys: "F", command: "\\frac{$$}{}" } },
      {
        kind: "environment" as const,
        environment: { name: "aligned", begin: "\\begin{aligned}", end: "\\end{aligned}" },
      },
      {
        kind: "template" as const,
        id: "maxwell",
        content: "## Maxwell\n\n$$E=mc^2$$",
      },
    ];

    for (const payload of payloads) {
      expect(decodeFormulaPanelDragPayload(encodeFormulaPanelDragPayload(payload)))
        .toEqual(payload);
    }
  });

  it("rejects malformed or unrelated drag data", () => {
    expect(decodeFormulaPanelDragPayload("")).toBeNull();
    expect(decodeFormulaPanelDragPayload("not json")).toBeNull();
    expect(decodeFormulaPanelDragPayload('{"kind":"template","content":42}'))
      .toBeNull();
    expect(decodeFormulaPanelDragPayload(
      '{"kind":"shortcut","shortcut":{"keys":"F"}}',
    )).toBeNull();
  });

  it("shows, moves, and clears the editor drop cursor decoration", () => {
    let state = EditorState.create({
      doc: "abc",
      extensions: [formulaPanelDropCursorField],
    });
    expect(state.field(formulaPanelDropCursorField).size).toBe(0);

    state = state.update({ effects: setFormulaPanelDropPosition.of(2) }).state;
    expect(state.field(formulaPanelDropCursorField).size).toBe(1);

    state = state.update({ effects: setFormulaPanelDropPosition.of(null) }).state;
    expect(state.field(formulaPanelDropCursorField).size).toBe(0);
  });
});
