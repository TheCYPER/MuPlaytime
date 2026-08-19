import { z } from "zod";
import type {
  MemberId,
  OptionId,
  ProposalId,
  RoomId,
  RoomSnapshot,
  ScheduleSetId,
  WatchId,
} from "../domain/types";

const id = z.string().uuid();
const clientDate = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/);
const timestamp = z
  .string()
  .refine(
    (value) =>
      /^(?!0000)\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(value)),
    "timestamp_outside_client_range",
  );
const localTimestamp = z
  .string()
  .refine(
    (value) =>
      /^(?!0000)\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(`${value}Z`)),
    "timestamp_outside_client_range",
  );

const memberRow = z.object({
  id,
  room_id: id,
  display_name: z.string().min(1),
  normalized_name: z.string().min(1),
  created_at: timestamp,
});

const intervalRow = z.object({
  iso_weekday: z.number().int().min(1).max(7).optional(),
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(1440),
  state: z.enum(["free", "busy"]),
});

const scheduleRow = z.object({
  id,
  room_id: id,
  member_id: id,
  time_zone: z.string().min(1),
  version: z.number().int().nonnegative(),
  weekly: z.array(intervalRow.required({ iso_weekday: true })),
  overrides: z.array(
    z.object({
      local_date: clientDate,
      version: z.number().int().nonnegative(),
      intervals: z.array(intervalRow.omit({ iso_weekday: true })),
    }),
  ),
});

const optionRow = z.object({
  id,
  room_id: id,
  proposal_id: id,
  suggested_by_member_id: id,
  starts_at: timestamp,
  duration_minutes: z.number().int().positive(),
  source_time_zone: z.string().min(1),
  source_local_start: localTimestamp,
  source_offset: z.string().min(1),
  withdrawn_at: timestamp.nullable(),
});

const responseRow = z.object({
  room_id: id,
  option_id: id,
  member_id: id,
  response: z.enum(["accept", "decline", "maybe"]),
  withdrawn_at: timestamp.nullable(),
  updated_at: timestamp,
});

const watchRow = z.object({
  id,
  room_id: id,
  option_id: id,
  member_id: id,
  threshold: z.number().int().positive(),
  triggered_at: timestamp.nullable(),
  acknowledged_at: timestamp.nullable(),
  closed_at: timestamp.nullable(),
  close_reason: z
    .enum(["option_withdrawn", "not_selected", "proposal_cancelled"])
    .nullable(),
  created_at: timestamp,
});

const proposalRow = z.object({
  id,
  room_id: id,
  created_by_member_id: id,
  game_name: z.string().min(1),
  status: z.enum(["open", "scheduled", "cancelled"]),
  confirmed_option_id: id.nullable(),
  created_at: timestamp,
  options: z.array(optionRow),
  responses: z.array(responseRow),
  watches: z.array(watchRow),
});

export const roomSnapshotRow = z.object({
  room_id: id,
  room_name: z.string().min(1),
  current_member_id: id,
  members: z.array(memberRow),
  schedules: z.array(scheduleRow),
  proposals: z.array(proposalRow),
  change_sequence: z.number().int().nonnegative(),
});

export const roomClaimRow = z.object({
  room_id: id,
  member_id: id,
  display_name: z.string().min(1),
  normalized_name: z.string().min(1),
  invite_token: z.string().min(32).optional(),
});

export const schemaMetaRow = z.object({
  schema_version: z.string().min(1),
  normalization_version: z.string().min(1),
});

export type RoomClaim = z.infer<typeof roomClaimRow>;
export type SchemaMeta = z.infer<typeof schemaMetaRow>;

export function decodeRoomSnapshot(input: unknown): RoomSnapshot {
  const row = roomSnapshotRow.parse(input);
  return {
    roomId: row.room_id as RoomId,
    roomName: row.room_name,
    currentMemberId: row.current_member_id as MemberId,
    members: row.members.map((member) => ({
      id: member.id as MemberId,
      roomId: member.room_id as RoomId,
      displayName: member.display_name,
      normalizedName: member.normalized_name,
      createdAt: member.created_at,
    })),
    schedules: row.schedules.map((schedule) => ({
      id: schedule.id as ScheduleSetId,
      roomId: schedule.room_id as RoomId,
      memberId: schedule.member_id as MemberId,
      timeZone: schedule.time_zone,
      version: schedule.version,
      weekly: schedule.weekly.map((interval) => ({
        isoWeekday: interval.iso_weekday,
        startMinute: interval.start_minute,
        endMinute: interval.end_minute,
        state: interval.state,
      })),
      overrides: schedule.overrides.map((override) => ({
        localDate: override.local_date,
        version: override.version,
        intervals: override.intervals.map((interval) => ({
          startMinute: interval.start_minute,
          endMinute: interval.end_minute,
          state: interval.state,
        })),
      })),
    })),
    proposals: row.proposals.map((proposal) => ({
      id: proposal.id as ProposalId,
      roomId: proposal.room_id as RoomId,
      createdByMemberId: proposal.created_by_member_id as MemberId,
      gameName: proposal.game_name,
      status: proposal.status,
      confirmedOptionId: proposal.confirmed_option_id as OptionId | null,
      createdAt: proposal.created_at,
      options: proposal.options.map((option) => ({
        id: option.id as OptionId,
        roomId: option.room_id as RoomId,
        proposalId: option.proposal_id as ProposalId,
        suggestedByMemberId: option.suggested_by_member_id as MemberId,
        startsAt: option.starts_at,
        durationMinutes: option.duration_minutes,
        sourceTimeZone: option.source_time_zone,
        sourceLocalStart: option.source_local_start,
        sourceOffset: option.source_offset,
        withdrawnAt: option.withdrawn_at,
      })),
      responses: proposal.responses.map((response) => ({
        roomId: response.room_id as RoomId,
        optionId: response.option_id as OptionId,
        memberId: response.member_id as MemberId,
        response: response.response,
        withdrawnAt: response.withdrawn_at,
        updatedAt: response.updated_at,
      })),
      watches: proposal.watches.map((watch) => ({
        id: watch.id as WatchId,
        roomId: watch.room_id as RoomId,
        optionId: watch.option_id as OptionId,
        memberId: watch.member_id as MemberId,
        threshold: watch.threshold,
        triggeredAt: watch.triggered_at,
        acknowledgedAt: watch.acknowledged_at,
        closedAt: watch.closed_at,
        closeReason: watch.close_reason,
        createdAt: watch.created_at,
      })),
    })),
    changeSequence: row.change_sequence,
  };
}
