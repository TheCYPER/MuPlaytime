import type { QueryClient } from "@tanstack/react-query";
import type { RoomId } from "../domain/types";

export const roomKeys = {
  all: (roomId: RoomId) => ["room", roomId] as const,
  snapshot: (roomId: RoomId) => ["room", roomId, "snapshot"] as const,
};

export async function invalidateRoom(
  queryClient: QueryClient,
  roomId: RoomId,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: roomKeys.all(roomId) });
}
