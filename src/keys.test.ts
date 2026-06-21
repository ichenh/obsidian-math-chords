import { describe, expect, it } from "vitest";
import { eventMatchesChord } from "./keys";

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
