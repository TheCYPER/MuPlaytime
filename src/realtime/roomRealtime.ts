import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import type { RoomId } from "../domain/types";
import { invalidateRoom } from "../data/query";

export function subscribeToRoomChanges(
  client: SupabaseClient,
  queryClient: QueryClient,
  roomId: RoomId,
): () => void {
  let subscriptionWarmupTimer: number | undefined;
  const refresh = () => {
    void invalidateRoom(queryClient, roomId);
  };
  const channel = client
    .channel(`room-changes:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "room_change_events",
        filter: `room_id=eq.${roomId}`,
      },
      refresh,
    )
    .subscribe((status) => {
      if (String(status) === "SUBSCRIBED") {
        refresh();
        window.clearTimeout(subscriptionWarmupTimer);
        subscriptionWarmupTimer = window.setTimeout(refresh, 2_000);
      }
    });

  const onVisibility = () => {
    if (document.visibilityState === "visible") refresh();
  };
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.clearTimeout(subscriptionWarmupTimer);
    window.removeEventListener("online", refresh);
    document.removeEventListener("visibilitychange", onVisibility);
    void client.removeChannel(channel);
  };
}
