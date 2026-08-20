import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  isInvalidInviteError,
  isScheduleVersionConflict,
  RoomRepository,
  RoomRpcError,
} from "./repository";

describe("RoomRepository errors", () => {
  it("preserves the PostgreSQL error code from an RPC failure", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "40001", message: "schedule_version_conflict" },
    });
    const repository = new RoomRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.schemaMeta()).rejects.toMatchObject({
      name: "RoomRpcError",
      code: "40001",
      message: "schedule_version_conflict",
    });
  });

  it("classifies only schedule serialization conflicts as retryable paints", () => {
    expect(
      isScheduleVersionConflict(
        new RoomRpcError("schedule_version_conflict", "40001"),
      ),
    ).toBe(true);
    expect(isScheduleVersionConflict(new Error("offline"))).toBe(false);
  });

  it("distinguishes invalid invites from service failures", () => {
    expect(
      isInvalidInviteError(new RoomRpcError("invite_invalid", "22023")),
    ).toBe(true);
    expect(
      isInvalidInviteError(
        new RoomRpcError("time_zone_invalid: invite_invalid", "22023"),
      ),
    ).toBe(false);
    expect(isInvalidInviteError(new TypeError("Failed to fetch"))).toBe(false);
  });
});
