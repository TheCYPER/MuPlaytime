export const ROOM_MUTATION_NETWORK_MODE = "always" as const;

export class OfflineRoomMutationError extends Error {
  constructor() {
    super("room_mutation_offline");
    this.name = "OfflineRoomMutationError";
  }
}

export async function executeRoomMutation({
  onlineAtSubmit,
  operation,
}: {
  onlineAtSubmit: boolean;
  operation: () => Promise<unknown>;
}): Promise<unknown> {
  if (!onlineAtSubmit || !navigator.onLine) {
    throw new OfflineRoomMutationError();
  }
  return operation();
}
