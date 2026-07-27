import { describe, expect, it } from "vitest";
import { resizeFloatingRect } from "../../src/tikz/floatingResize";

describe("floating TikZ preview resizing", () => {
  it("resizes from the north-west corner while preserving the opposite corner", () => {
    expect(
      resizeFloatingRect(
        { left: 400, top: 200, width: 500, height: 320 },
        "nw",
        -80,
        -40,
        1200,
        800,
      ),
    ).toEqual({ left: 320, top: 160, width: 580, height: 360 });
  });

  it("enforces the minimum size when resizing from an edge", () => {
    expect(
      resizeFloatingRect(
        { left: 100, top: 100, width: 400, height: 300 },
        "w",
        350,
        0,
        1000,
        700,
      ),
    ).toEqual({ left: 260, top: 100, width: 240, height: 300 });
  });

  it("keeps south-east resizing inside the viewport", () => {
    expect(
      resizeFloatingRect(
        { left: 700, top: 500, width: 260, height: 180 },
        "se",
        500,
        500,
        1000,
        720,
      ),
    ).toEqual({ left: 700, top: 500, width: 300, height: 220 });
  });
});
