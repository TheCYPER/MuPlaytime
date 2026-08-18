import { describe, expect, it } from "vitest";
import type { MemberId } from "../domain/types";
import { summarizeSelection, sweepOverlap } from "./overlap";

const member = (value: string) => value as MemberId;

describe("sweepOverlap", () => {
  it("keeps unknown visible and counts only explicit free", () => {
    const segments = sweepOverlap(
      [
        {
          memberId: member("a"),
          intervals: [
            {
              startEpochMilliseconds: 0,
              endEpochMilliseconds: 60,
              state: "free",
            },
          ],
        },
        {
          memberId: member("b"),
          intervals: [
            {
              startEpochMilliseconds: 30,
              endEpochMilliseconds: 90,
              state: "busy",
            },
          ],
        },
      ],
      0,
      90,
    );
    expect(segments.map((segment) => segment.freeCount)).toEqual([1, 1, 0]);
    expect(segments[0]?.unknownMemberIds).toEqual([member("b")]);
    expect(summarizeSelection(segments)).toEqual({
      minimum: 0,
      maximum: 1,
      total: 2,
    });
  });
});
