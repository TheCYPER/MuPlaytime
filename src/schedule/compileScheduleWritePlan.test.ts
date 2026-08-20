import { describe, expect, it } from "vitest";
import { compileScheduleWritePlan } from "./compileScheduleWritePlan";

const free = [{ startMinute: 60, endMinute: 120, state: "free" as const }];

describe("compileScheduleWritePlan", () => {
  it("compiles one day and an ordered adjacent pair", () => {
    expect(
      compileScheduleWritePlan([
        { day: { kind: "weekly", isoWeekday: 1 }, intervals: free },
      ]).kind,
    ).toBe("single");
    expect(
      compileScheduleWritePlan([
        { day: { kind: "weekly", isoWeekday: 7 }, intervals: free },
        { day: { kind: "weekly", isoWeekday: 1 }, intervals: free },
      ]).kind,
    ).toBe("orderedPair");
  });

  it("rejects non-adjacent and three-day plans", () => {
    expect(() =>
      compileScheduleWritePlan([
        { day: { kind: "weekly", isoWeekday: 1 }, intervals: free },
        { day: { kind: "weekly", isoWeekday: 3 }, intervals: free },
      ]),
    ).toThrow(/one_or_two_adjacent/);
    expect(() =>
      compileScheduleWritePlan([
        { day: { kind: "date", localDate: "2026-08-19" }, intervals: free },
        { day: { kind: "date", localDate: "2026-08-20" }, intervals: free },
        { day: { kind: "date", localDate: "2026-08-21" }, intervals: free },
      ]),
    ).toThrow(/one_or_two_adjacent/);
  });
});
