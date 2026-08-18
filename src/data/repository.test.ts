import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
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
});
