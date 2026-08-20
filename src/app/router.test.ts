import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseHash,
  proposalHash,
  proposalWasOpenedFromList,
  pushProposalHash,
  replaceHash,
  roomHash,
} from "./router";

describe("proposal hash navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/MuPlaytime/#/");
  });

  it("round-trips a route without copying selection into local state", () => {
    const hash = proposalHash("room / one", "proposal / one");
    expect(parseHash(hash)).toEqual({
      kind: "room",
      roomId: "room / one",
      view: "proposals",
      proposalId: "proposal / one",
    });
  });

  it("marks only the exact same-room list push as back-safe", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    pushProposalHash("room-1", "proposal-1");

    expect(window.location.hash).toBe("#/room/room-1/proposals/proposal-1");
    expect(proposalWasOpenedFromList("room-1", "proposal-1")).toBe(true);
    expect(proposalWasOpenedFromList("room-2", "proposal-1")).toBe(false);
    expect(proposalWasOpenedFromList("room-1", "proposal-2")).toBe(false);
    expect(dispatch).toHaveBeenCalledWith(expect.any(HashChangeEvent));
  });

  it("direct-list replacement clears a stale history marker", () => {
    pushProposalHash("room-1", "proposal-1");
    replaceHash(roomHash("room-1", "proposals"));

    expect(window.location.hash).toBe("#/room/room-1/proposals");
    expect(proposalWasOpenedFromList("room-1", "proposal-1")).toBe(false);
  });
});
