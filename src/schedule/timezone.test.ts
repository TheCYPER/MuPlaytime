import { describe, expect, it } from "vitest";
import {
  localProposalChoices,
  projectInstant,
  resolveLocalIntervals,
} from "./timezone";

describe("timezone resolution", () => {
  it("skips nonexistent New York spring-forward minutes", () => {
    const resolved = resolveLocalIntervals(
      "2026-03-08",
      [{ startMinute: 90, endMinute: 210, state: "free" }],
      "America/New_York",
    );
    expect(
      resolved.annotations.filter((item) => item.kind === "skipped"),
    ).toHaveLength(60);
    expect(
      resolved.intervals.every(
        (item) => item.endEpochMilliseconds > item.startEpochMilliseconds,
      ),
    ).toBe(true);
  });

  it("materializes both New York fall-back occurrences", () => {
    const choices = localProposalChoices(
      "2026-11-01T01:30",
      "America/New_York",
    );
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map((choice) => choice.offset)).size).toBe(2);
  });

  it("returns no choice for a nonexistent local proposal time", () => {
    expect(
      localProposalChoices("2026-03-08T02:30", "America/New_York"),
    ).toEqual([]);
  });

  it("has no DST annotations for Dubai", () => {
    expect(
      resolveLocalIntervals(
        "2026-03-08",
        [{ startMinute: 0, endMinute: 1440, state: "busy" }],
        "Asia/Dubai",
      ).annotations,
    ).toEqual([]);
  });

  it("skips the UK spring-forward hour and repeats the fall-back hour", () => {
    const spring = resolveLocalIntervals(
      "2026-03-29",
      [{ startMinute: 60, endMinute: 180, state: "free" }],
      "Europe/London",
    );
    expect(
      spring.annotations.filter((item) => item.kind === "skipped"),
    ).toHaveLength(60);

    const autumn = resolveLocalIntervals(
      "2026-10-25",
      [{ startMinute: 60, endMinute: 120, state: "free" }],
      "Europe/London",
    );
    expect(
      autumn.annotations.filter((item) => item.kind === "repeated"),
    ).toHaveLength(60);
    expect(
      autumn.intervals.reduce(
        (total, interval) =>
          total +
          interval.endEpochMilliseconds -
          interval.startEpochMilliseconds,
        0,
      ),
    ).toBe(120 * 60_000);
  });

  it("treats 1440 as the exclusive boundary on the next civil day", () => {
    const resolved = resolveLocalIntervals(
      "2026-12-31",
      [{ startMinute: 1439, endMinute: 1440, state: "busy" }],
      "Asia/Dubai",
    );
    expect(resolved.intervals).toHaveLength(1);
    const end = resolved.intervals[0]?.endEpochMilliseconds;
    expect(end).toBeDefined();
    expect(
      projectInstant(new Date(end!).toISOString(), "Asia/Dubai")
        .toPlainDate()
        .toString(),
    ).toBe("2027-01-01");
  });

  it.each(["+04", "+0400", "+04:00"])(
    "rejects numeric offset timezone identity %s",
    (zone) => {
      expect(() => localProposalChoices("2026-01-01T12:00", zone)).toThrow(
        "time_zone_invalid",
      );
    },
  );

  it.each(["UTC", "Asia/Dubai", "America/New_York", "CET"])(
    "accepts named timezone %s",
    (zone) => {
      expect(localProposalChoices("2026-01-15T12:00", zone)).toHaveLength(1);
    },
  );
});
