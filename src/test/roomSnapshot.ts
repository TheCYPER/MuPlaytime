import type {
  MemberId,
  OptionId,
  ProposalId,
  RoomId,
  RoomSnapshot,
  ScheduleSetId,
  WatchId,
} from "../domain/types";

const roomId = "00000000-0000-4000-8000-000000000001" as RoomId;
const percyId = "00000000-0000-4000-8000-000000000002" as MemberId;
const friendId = "00000000-0000-4000-8000-000000000003" as MemberId;
const proposalId = "00000000-0000-4000-8000-000000000010" as ProposalId;
const optionId = "00000000-0000-4000-8000-000000000011" as OptionId;

export function roomSnapshotFixture(
  overrides: Partial<RoomSnapshot> = {},
): RoomSnapshot {
  const base: RoomSnapshot = {
    roomId,
    roomName:
      "Friday crew coordinating a deliberately long cross-timezone game night",
    currentMemberId: percyId,
    changeSequence: 12,
    members: [
      {
        id: percyId,
        roomId,
        displayName: "Percy with a deliberately long mobile member name",
        normalizedName: "percy with a deliberately long mobile member name",
        createdAt: "2026-08-19T00:00:00Z",
      },
      {
        id: friendId,
        roomId,
        displayName: "London friend",
        normalizedName: "london friend",
        createdAt: "2026-08-19T00:00:00Z",
      },
    ],
    schedules: [
      {
        id: "00000000-0000-4000-8000-000000000020" as ScheduleSetId,
        roomId,
        memberId: percyId,
        timeZone: "Asia/Dubai",
        version: 3,
        weekly: [
          { isoWeekday: 1, startMinute: 930, endMinute: 1050, state: "free" },
          { isoWeekday: 1, startMinute: 1080, endMinute: 1200, state: "busy" },
        ],
        overrides: [],
      },
      {
        id: "00000000-0000-4000-8000-000000000021" as ScheduleSetId,
        roomId,
        memberId: friendId,
        timeZone: "Europe/London",
        version: 2,
        weekly: [
          { isoWeekday: 1, startMinute: 720, endMinute: 1080, state: "free" },
        ],
        overrides: [],
      },
    ],
    proposals: [
      {
        id: proposalId,
        roomId,
        createdByMemberId: percyId,
        gameName:
          "Deep Rock Galactic with a deliberately long mobile game title",
        status: "open",
        confirmedOptionId: null,
        createdAt: "2026-08-19T00:00:00Z",
        options: [
          {
            id: optionId,
            roomId,
            proposalId,
            suggestedByMemberId: percyId,
            startsAt: "2026-08-24T16:00:00Z",
            durationMinutes: 120,
            sourceTimeZone: "Asia/Dubai",
            sourceLocalStart: "2026-08-24T20:00",
            sourceOffset: "+04:00",
            withdrawnAt: null,
          },
        ],
        responses: [
          {
            roomId,
            optionId,
            memberId: friendId,
            response: "accept",
            withdrawnAt: null,
            updatedAt: "2026-08-19T01:00:00Z",
          },
        ],
        watches: [
          {
            id: "00000000-0000-4000-8000-000000000030" as WatchId,
            roomId,
            optionId,
            memberId: percyId,
            threshold: 2,
            triggeredAt: null,
            acknowledgedAt: null,
            closedAt: null,
            closeReason: null,
            createdAt: "2026-08-19T00:30:00Z",
          },
        ],
      },
    ],
  };
  return { ...base, ...overrides };
}
