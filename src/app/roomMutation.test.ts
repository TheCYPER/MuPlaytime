import {
  MutationObserver,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeRoomMutation,
  OfflineRoomMutationError,
  ROOM_MUTATION_NETWORK_MODE,
} from "./roomMutation";

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("room mutation offline boundary", () => {
  it("fails immediately without pausing or replaying after reconnect", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const operation = vi.fn().mockResolvedValue(undefined);
    onlineManager.setOnline(false);
    const observer = new MutationObserver(queryClient, {
      networkMode: ROOM_MUTATION_NETWORK_MODE,
      mutationFn: executeRoomMutation,
    });

    await expect(
      observer.mutate({ onlineAtSubmit: false, operation }),
    ).rejects.toBeInstanceOf(OfflineRoomMutationError);
    expect(observer.getCurrentResult().isPaused).toBe(false);
    expect(operation).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    await Promise.resolve();
    expect(operation).not.toHaveBeenCalled();
  });
});
