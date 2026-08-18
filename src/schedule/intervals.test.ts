import { describe, expect, it } from "vitest";
import { formatMinute, paintInterval, splitAcrossMidnight } from "./intervals";

describe("paintInterval", () => {
  it("splits and replaces overlapping intervals", () => {
    expect(
      paintInterval(
        [{ startMinute: 60, endMinute: 240, state: "free" }],
        120,
        180,
        "busy",
      ),
    ).toEqual([
      { startMinute: 60, endMinute: 120, state: "free" },
      { startMinute: 120, endMinute: 180, state: "busy" },
      { startMinute: 180, endMinute: 240, state: "free" },
    ]);
  });

  it("erases to unknown and merges matching neighbors", () => {
    expect(
      paintInterval(
        [
          { startMinute: 60, endMinute: 120, state: "free" },
          { startMinute: 120, endMinute: 180, state: "busy" },
          { startMinute: 180, endMinute: 240, state: "free" },
        ],
        120,
        180,
        "unknown",
      ),
    ).toEqual([
      { startMinute: 60, endMinute: 120, state: "free" },
      { startMinute: 180, endMinute: 240, state: "free" },
    ]);
  });
});

describe("splitAcrossMidnight", () => {
  it("uses 1440 as the exclusive day boundary", () => {
    expect(splitAcrossMidnight(7, 1380, 1500, "free")).toEqual([
      { isoWeekday: 7, startMinute: 1380, endMinute: 1440, state: "free" },
      { isoWeekday: 1, startMinute: 0, endMinute: 60, state: "free" },
    ]);
  });

  it("does not create a next-day interval when the range ends at midnight", () => {
    expect(splitAcrossMidnight(7, 1380, 1440, "free")).toEqual([
      { isoWeekday: 7, startMinute: 1380, endMinute: 1440, state: "free" },
    ]);
    expect(formatMinute(1440)).toBe("24:00");
  });

  it("rejects a zero-length span beginning at the exclusive boundary", () => {
    expect(() => splitAcrossMidnight(1, 1440, 1500, "free")).toThrow(
      "start_minute_invalid",
    );
  });
});
