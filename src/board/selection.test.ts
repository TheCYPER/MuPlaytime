import { describe, expect, it } from "vitest";
import { roomSnapshotFixture } from "../test/roomSnapshot";
import {
  BOARD_STEP_MILLISECONDS,
  clippedSelectionSegments,
  projectSelectionRange,
  validateInstantRange,
} from "./selection";

describe("validateInstantRange", () => {
  const start = Date.parse("2026-08-19T00:00:00Z");

  it.each([30, 1440])("accepts the %i-minute boundary", (minutes) => {
    expect(
      validateInstantRange({
        startEpochMilliseconds: start,
        endEpochMilliseconds: start + minutes * 60_000,
      }).valid,
    ).toBe(true);
  });

  it("rejects reversed, non-step, and longer-than-day ranges", () => {
    expect(
      validateInstantRange({
        startEpochMilliseconds: start,
        endEpochMilliseconds: start - BOARD_STEP_MILLISECONDS,
      }).valid,
    ).toBe(false);
    expect(
      validateInstantRange({
        startEpochMilliseconds: start,
        endEpochMilliseconds: start + 45 * 60_000,
      }).valid,
    ).toBe(false);
    expect(
      validateInstantRange({
        startEpochMilliseconds: start,
        endEpochMilliseconds: start + 1470 * 60_000,
      }).valid,
    ).toBe(false);
  });
});

describe("projectSelectionRange", () => {
  function expectMemberIntervalsAreUniqueAndNonOverlapping(
    projected: ReturnType<typeof projectSelectionRange>,
  ) {
    for (const schedule of projected.schedules) {
      const identities = schedule.intervals.map(
        (interval) =>
          `${interval.startEpochMilliseconds}-${interval.endEpochMilliseconds}-${interval.state}`,
      );
      expect(new Set(identities).size).toBe(identities.length);
      for (let index = 1; index < schedule.intervals.length; index += 1) {
        expect(
          schedule.intervals[index - 1]!.endEpochMilliseconds,
        ).toBeLessThanOrEqual(
          schedule.intervals[index]!.startEpochMilliseconds,
        );
      }
    }
  }

  it("preserves the same UTC range while the viewer projection crosses midnight", () => {
    const snapshot = roomSnapshotFixture();
    const range = {
      startEpochMilliseconds: Date.parse("2026-08-23T15:30:00Z"),
      endEpochMilliseconds: Date.parse("2026-08-23T17:30:00Z"),
    };
    const projected = projectSelectionRange(snapshot, range, "Asia/Shanghai");
    expect(projected.viewerDates).toEqual(["2026-08-23", "2026-08-24"]);
    expect(projected.rangeStart).toBeLessThanOrEqual(
      range.startEpochMilliseconds,
    );
    expect(projected.rangeEnd).toBeGreaterThanOrEqual(
      range.endEpochMilliseconds,
    );
    const segments = clippedSelectionSegments(projected, range);
    expect(segments.length).toBeGreaterThan(0);
    expect(
      segments.every(
        (segment) =>
          segment.startEpochMilliseconds >= range.startEpochMilliseconds,
      ),
    ).toBe(true);
    expect(
      segments.every(
        (segment) => segment.endEpochMilliseconds <= range.endEpochMilliseconds,
      ),
    ).toBe(true);
  });

  it("projects a 1440-minute spring-forward range across all three civil dates", () => {
    const fixture = roomSnapshotFixture();
    const snapshot = {
      ...fixture,
      schedules: fixture.schedules.map((schedule) => ({
        ...schedule,
        timeZone: "Etc/UTC",
        weekly: [1, 6, 7].map((isoWeekday) => ({
          isoWeekday,
          startMinute: 0,
          endMinute: 1440,
          state: "free" as const,
        })),
        overrides: [],
      })),
    };
    const startEpochMilliseconds = Date.parse("2026-03-08T04:30:00Z");
    const range = {
      startEpochMilliseconds,
      endEpochMilliseconds: startEpochMilliseconds + 1440 * 60_000,
    };

    expect(validateInstantRange(range)).toEqual({
      valid: true,
      durationMinutes: 1440,
    });
    const projected = projectSelectionRange(
      snapshot,
      range,
      "America/New_York",
    );
    expect(projected.viewerDates).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
    expectMemberIntervalsAreUniqueAndNonOverlapping(projected);
  });

  it("clips member intervals to each viewer day before composing two days", () => {
    const snapshot = roomSnapshotFixture();
    const range = {
      startEpochMilliseconds: Date.parse("2026-08-24T15:30:00Z"),
      endEpochMilliseconds: Date.parse("2026-08-24T17:30:00Z"),
    };

    const projected = projectSelectionRange(snapshot, range, "Asia/Shanghai");
    const london = projected.schedules.find(
      (schedule) => schedule.memberId === snapshot.members[1]!.id,
    )!;

    expect(projected.viewerDates).toEqual(["2026-08-24", "2026-08-25"]);
    expect(london.intervals).toEqual([
      {
        startEpochMilliseconds: Date.parse("2026-08-24T11:00:00Z"),
        endEpochMilliseconds: Date.parse("2026-08-24T16:00:00Z"),
        state: "free",
      },
      {
        startEpochMilliseconds: Date.parse("2026-08-24T16:00:00Z"),
        endEpochMilliseconds: Date.parse("2026-08-24T17:00:00Z"),
        state: "free",
      },
    ]);
    expectMemberIntervalsAreUniqueAndNonOverlapping(projected);
  });
});
