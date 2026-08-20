import type { SupabaseClient } from "@supabase/supabase-js";
import { z, type ZodType } from "zod";
import type {
  OptionId,
  ProposalId,
  ResponseChoice,
  RoomId,
  RoomSnapshot,
  ScheduleInterval,
  WatchId,
} from "../domain/types";
import {
  decodeRoomSnapshot,
  roomClaimRow,
  schemaMetaRow,
  type RoomClaim,
  type SchemaMeta,
} from "./schemas";

const voidResult = z.union([z.null(), z.object({ ok: z.literal(true) })]);

interface RpcResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export class RoomRpcError extends Error {
  public constructor(
    message: string,
    public readonly code: string | undefined,
  ) {
    super(message);
    this.name = "RoomRpcError";
  }
}

export function isScheduleVersionConflict(error: unknown): boolean {
  return (
    error instanceof RoomRpcError &&
    (error.code === "40001" ||
      error.message.includes("schedule_version_conflict"))
  );
}

export function isInvalidInviteError(error: unknown): boolean {
  return error instanceof RoomRpcError && error.message === "invite_invalid";
}

async function rpcDecoded<T>(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
  schema: ZodType<T>,
): Promise<T> {
  const response = (await client.rpc(
    functionName as never,
    args as never,
  )) as unknown as RpcResponse;
  if (response.error) {
    throw new RoomRpcError(response.error.message, response.error.code);
  }
  return schema.parse(response.data);
}

function serializedIntervals(intervals: readonly ScheduleInterval[]) {
  return intervals.map((interval) => ({
    start_minute: interval.startMinute,
    end_minute: interval.endMinute,
    state: interval.state,
  }));
}

export interface ConcreteOptionInput {
  startsAt: string;
  durationMinutes: number;
  sourceTimeZone: string;
  sourceLocalStart: string;
  sourceOffset: string;
}

export class RoomRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public schemaMeta(): Promise<SchemaMeta> {
    return rpcDecoded(this.client, "get_schema_meta", {}, schemaMetaRow);
  }

  public createRoom(input: {
    roomName: string;
    displayName: string;
    initialTimeZone: string;
  }): Promise<RoomClaim> {
    return rpcDecoded(
      this.client,
      "create_room",
      {
        p_room_name: input.roomName,
        p_display_name: input.displayName,
        p_initial_time_zone: input.initialTimeZone,
      },
      roomClaimRow,
    );
  }

  public joinRoom(input: {
    inviteToken: string;
    displayName: string;
    initialTimeZone: string;
  }): Promise<RoomClaim> {
    return rpcDecoded(
      this.client,
      "join_room",
      {
        p_invite_token: input.inviteToken,
        p_display_name: input.displayName,
        p_initial_time_zone: input.initialTimeZone,
      },
      roomClaimRow,
    );
  }

  public async snapshot(roomId: RoomId): Promise<RoomSnapshot> {
    const response = (await this.client.rpc(
      "get_room_snapshot" as never,
      {
        p_room_id: roomId,
      } as never,
    )) as unknown as RpcResponse;
    if (response.error) {
      throw new RoomRpcError(response.error.message, response.error.code);
    }
    return decodeRoomSnapshot(response.data);
  }

  public replaceWeeklyDay(input: {
    roomId: RoomId;
    isoWeekday: number;
    expectedVersion: number;
    intervals: readonly ScheduleInterval[];
  }): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "replace_weekly_day",
      {
        p_room_id: input.roomId,
        p_iso_weekday: input.isoWeekday,
        p_expected_version: input.expectedVersion,
        p_intervals: serializedIntervals(input.intervals),
      },
      voidResult,
    );
  }

  public replaceWeeklyPair(input: {
    roomId: RoomId;
    firstWeekday: number;
    secondWeekday: number;
    expectedVersion: number;
    firstIntervals: readonly ScheduleInterval[];
    secondIntervals: readonly ScheduleInterval[];
  }): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "replace_weekly_pair",
      {
        p_room_id: input.roomId,
        p_first_weekday: input.firstWeekday,
        p_second_weekday: input.secondWeekday,
        p_expected_version: input.expectedVersion,
        p_first_intervals: serializedIntervals(input.firstIntervals),
        p_second_intervals: serializedIntervals(input.secondIntervals),
      },
      voidResult,
    );
  }

  public replaceDateOverride(input: {
    roomId: RoomId;
    localDate: string;
    expectedVersion: number;
    intervals: readonly ScheduleInterval[];
  }): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "replace_date_override",
      {
        p_room_id: input.roomId,
        p_local_date: input.localDate,
        p_expected_version: input.expectedVersion,
        p_intervals: serializedIntervals(input.intervals),
      },
      voidResult,
    );
  }

  public replaceDateOverridePair(input: {
    roomId: RoomId;
    firstDate: string;
    secondDate: string;
    expectedVersion: number;
    firstIntervals: readonly ScheduleInterval[];
    secondIntervals: readonly ScheduleInterval[];
  }): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "replace_date_override_pair",
      {
        p_room_id: input.roomId,
        p_first_date: input.firstDate,
        p_second_date: input.secondDate,
        p_expected_version: input.expectedVersion,
        p_first_intervals: serializedIntervals(input.firstIntervals),
        p_second_intervals: serializedIntervals(input.secondIntervals),
      },
      voidResult,
    );
  }

  public restoreDateOverride(
    roomId: RoomId,
    localDate: string,
    expectedVersion: number,
  ): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "restore_date_override",
      {
        p_room_id: roomId,
        p_local_date: localDate,
        p_expected_version: expectedVersion,
      },
      voidResult,
    );
  }

  public migrateScheduleZone(input: {
    roomId: RoomId;
    timeZone: string;
    expectedVersion: number;
  }): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "migrate_schedule_zone",
      {
        p_room_id: input.roomId,
        p_time_zone: input.timeZone,
        p_expected_version: input.expectedVersion,
      },
      voidResult,
    );
  }

  public createProposal(
    roomId: RoomId,
    gameName: string,
    option: ConcreteOptionInput,
  ): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "create_proposal_with_initial_option",
      {
        p_room_id: roomId,
        p_game_name: gameName,
        p_starts_at: option.startsAt,
        p_duration_minutes: option.durationMinutes,
        p_source_time_zone: option.sourceTimeZone,
        p_source_local_start: option.sourceLocalStart,
        p_source_offset: option.sourceOffset,
      },
      z.object({
        proposal_id: z.string().uuid(),
        option_id: z.string().uuid(),
      }),
    );
  }

  public addOption(
    roomId: RoomId,
    proposalId: ProposalId,
    option: ConcreteOptionInput,
  ): Promise<unknown> {
    return rpcDecoded(
      this.client,
      "add_proposal_option",
      {
        p_room_id: roomId,
        p_proposal_id: proposalId,
        p_starts_at: option.startsAt,
        p_duration_minutes: option.durationMinutes,
        p_source_time_zone: option.sourceTimeZone,
        p_source_local_start: option.sourceLocalStart,
        p_source_offset: option.sourceOffset,
      },
      z.object({ option_id: z.string().uuid() }),
    );
  }

  private voidMutation(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return rpcDecoded(this.client, functionName, args, voidResult);
  }

  public respond(
    roomId: RoomId,
    optionId: OptionId,
    response: ResponseChoice | null,
  ): Promise<unknown> {
    return this.voidMutation("set_option_response", {
      p_room_id: roomId,
      p_option_id: optionId,
      p_response: response,
    });
  }

  public confirm(
    roomId: RoomId,
    proposalId: ProposalId,
    optionId: OptionId,
  ): Promise<unknown> {
    return this.voidMutation("confirm_proposal_option", {
      p_room_id: roomId,
      p_proposal_id: proposalId,
      p_option_id: optionId,
    });
  }

  public rename(
    roomId: RoomId,
    proposalId: ProposalId,
    gameName: string,
  ): Promise<unknown> {
    return this.voidMutation("rename_proposal", {
      p_room_id: roomId,
      p_proposal_id: proposalId,
      p_game_name: gameName,
    });
  }

  public cancel(roomId: RoomId, proposalId: ProposalId): Promise<unknown> {
    return this.voidMutation("cancel_proposal", {
      p_room_id: roomId,
      p_proposal_id: proposalId,
    });
  }

  public withdrawOption(roomId: RoomId, optionId: OptionId): Promise<unknown> {
    return this.voidMutation("withdraw_proposal_option", {
      p_room_id: roomId,
      p_option_id: optionId,
    });
  }

  public setWatch(
    roomId: RoomId,
    optionId: OptionId,
    threshold: number,
  ): Promise<unknown> {
    return this.voidMutation("set_threshold_watch", {
      p_room_id: roomId,
      p_option_id: optionId,
      p_threshold: threshold,
    });
  }

  public acknowledgeWatch(roomId: RoomId, watchId: WatchId): Promise<unknown> {
    return this.voidMutation("acknowledge_triggered_watch", {
      p_room_id: roomId,
      p_watch_id: watchId,
    });
  }
}
