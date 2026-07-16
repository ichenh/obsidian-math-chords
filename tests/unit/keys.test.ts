import { describe, expect, it } from "vitest";
import {
  eventMatchesChord,
  isValidChord,
  normalizeSequenceKeys,
  parseChord,
  parseKeysField,
} from "../../src/keys";

function keyEvent(partial: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return partial as KeyboardEvent;
}

describe("eventMatchesChord", () => {
  it("matches Alt+ArrowRight", () => {
    expect(
      eventMatchesChord(
        keyEvent({
          key: "ArrowRight",
          altKey: true,
          ctrlKey: false,
          shiftKey: false,
          metaKey: false,
        }),
        "Alt+ArrowRight",
      ),
    ).toBe(true);
  });

  it("matches Alt+ArrowLeft", () => {
    expect(
      eventMatchesChord(
        keyEvent({
          key: "ArrowLeft",
          altKey: true,
          ctrlKey: false,
          shiftKey: false,
          metaKey: false,
        }),
        "Alt+ArrowLeft",
      ),
    ).toBe(true);
  });

  it("does not match Tab", () => {
    expect(eventMatchesChord(keyEvent({ key: "Tab" }), "Alt+ArrowRight")).toBe(false);
  });

  it("does not match plain ArrowRight", () => {
    expect(eventMatchesChord(keyEvent({ key: "ArrowRight" }), "Alt+ArrowRight")).toBe(false);
  });
});

describe("chord parsing", () => {
  it("preserves a literal plus key", () => {
    expect(parseChord("+")).toBe("+");
    expect(parseChord("Shift++")).toBe("shift++");
    expect(parseKeysField("+")).toEqual(["+"]);
  });

  it("rejects modifier-only and multi-base chords", () => {
    expect(isValidChord("Ctrl+Alt")).toBe(false);
    expect(isValidChord("A+B")).toBe(false);
    expect(parseKeysField("Ctrl+Alt")).toEqual([]);
  });

  it("offers an unshifted fallback for printable punctuation", () => {
    expect(normalizeSequenceKeys(keyEvent({ key: '"', shiftKey: true }))).toEqual([
      'shift+"',
      '"',
    ]);
    expect(normalizeSequenceKeys(keyEvent({ key: "A", shiftKey: true }))).toEqual([
      "shift+a",
    ]);
  });

  it("normalizes configured modifier chords after the leader", () => {
    expect(normalizeSequenceKeys(keyEvent({ key: "A", ctrlKey: true }))).toEqual(["ctrl+a"]);
    expect(
      normalizeSequenceKeys(keyEvent({ key: "K", altKey: true, shiftKey: true })),
    ).toEqual(["alt+shift+k"]);
  });
});
