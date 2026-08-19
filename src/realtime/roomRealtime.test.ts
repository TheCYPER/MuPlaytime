import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomId } from "../domain/types";
import { subscribeToRoomChanges } from "./roomRealtime";

describe("subscribeToRoomChanges", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconciles immediately and once more after subscription warmup", async () => {
    vi.useFakeTimers();
    let onStatus: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((handler: (status: string) => void) => {
        onStatus = handler;
        return channel;
      }),
    };
    const removeChannel = vi.fn().mockResolvedValue(undefined);
    const client = {
      channel: vi.fn(() => channel),
      removeChannel,
    } as unknown as SupabaseClient;
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    const unsubscribe = subscribeToRoomChanges(
      client,
      queryClient,
      "11111111-1111-4111-8111-111111111111" as RoomId,
    );

    onStatus?.("SUBSCRIBED");
    expect(invalidateQueries).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);

    unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("cancels the warmup reconciliation when the room unmounts", async () => {
    vi.useFakeTimers();
    let onStatus: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((handler: (status: string) => void) => {
        onStatus = handler;
        return channel;
      }),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseClient;
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    const unsubscribe = subscribeToRoomChanges(
      client,
      queryClient,
      "22222222-2222-4222-8222-222222222222" as RoomId,
    );
    onStatus?.("SUBSCRIBED");
    unsubscribe();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
