export type AppRoute =
  | { kind: "landing" }
  | { kind: "join"; inviteToken: string }
  | {
      kind: "room";
      roomId: string;
      view: "group" | "schedule" | "proposals";
      proposalId?: string;
    };

export function parseHash(hash = window.location.hash): AppRoute {
  const path = hash.replace(/^#\/?/, "");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "join" && parts[1]) {
    return { kind: "join", inviteToken: parts[1] };
  }
  if (parts[0] === "room" && parts[1]) {
    const leaf = parts[2];
    if (leaf === "me")
      return { kind: "room", roomId: parts[1], view: "schedule" };
    if (leaf === "proposals") {
      return {
        kind: "room",
        roomId: parts[1],
        view: "proposals",
        proposalId: parts[3],
      };
    }
    return { kind: "room", roomId: parts[1], view: "group" };
  }
  return { kind: "landing" };
}

export function roomHash(
  roomId: string,
  view: "group" | "schedule" | "proposals" = "group",
): string {
  const base = `#/room/${encodeURIComponent(roomId)}`;
  if (view === "schedule") return `${base}/me`;
  if (view === "proposals") return `${base}/proposals`;
  return base;
}

export function replaceHash(hash: string): void {
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
