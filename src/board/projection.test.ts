import { describe, expect, it } from "vitest";
import type {
  MemberId,
  RoomId,
  RoomSnapshot,
  ScheduleSetId,
} from "../domain/types";
import { projectBoardDay } from "./projection";

describe("projectBoardDay", () => {
  it("projects schedules onto the viewer zone without mutating anchors", () => {
    const snapshot: RoomSnapshot = {
      roomId: "00000000-0000-4000-8000-000000000001" as RoomId,
      roomName: "Test",
      currentMemberId: "00000000-0000-4000-8000-000000000002" as MemberId,
      changeSequence: 0,
      members: [
        {
          id: "00000000-0000-4000-8000-000000000002" as MemberId,
          roomId: "00000000-0000-4000-8000-000000000001" as RoomId,
          displayName: "Percy",
          normalizedName: "percy",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      schedules: [
        {
          id: "00000000-0000-4000-8000-000000000003" as ScheduleSetId,
          roomId: "00000000-0000-4000-8000-000000000001" as RoomId,
          memberId: "00000000-0000-4000-8000-000000000002" as MemberId,
          timeZone: "Asia/Dubai",
          version: 1,
          weekly: [
            { isoWeekday: 1, startMinute: 720, endMinute: 780, state: "free" },
          ],
          overrides: [],
        },
      ],
      proposals: [],
    };
    const projection = projectBoardDay(snapshot, "2026-08-17", "Asia/Shanghai");
    expect(projection.schedules[0]?.intervals).toHaveLength(1);
    expect(snapshot.schedules[0]?.timeZone).toBe("Asia/Dubai");
  });

  it("returns an explicit skipped-date projection for the Apia dateline jump", () => {
    const snapshot = {
      roomId: "00000000-0000-4000-8000-000000000001" as RoomId,
      roomName: "Test",
      currentMemberId: "00000000-0000-4000-8000-000000000002" as MemberId,
      changeSequence: 0,
      members: [],
      schedules: [],
      proposals: [],
    } satisfies RoomSnapshot;
    expect(
      projectBoardDay(snapshot, "2011-12-30", "Pacific/Apia").skippedViewerDate,
    ).toBe(true);
  });
});
