import { beforeEach, describe, expect, it } from "vitest";
import {
  readPreferences,
  writePreferences,
  type Preferences,
} from "./preferences";

function storageContents(storage: Storage): string {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index);
    return key ? `${key}:${storage.getItem(key) ?? ""}` : "";
  }).join("\n");
}

describe("preference persistence boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("strips a raw invite capability instead of persisting it", () => {
    const rawInvite = "raw-invite-must-remain-in-tab-memory";
    const unsafePatch = {
      lastRoomId: "00000000-0000-4000-8000-000000000001",
      inviteToken: rawInvite,
    } as unknown as Partial<Preferences>;

    const stored = writePreferences(unsafePatch);

    expect(stored).not.toHaveProperty("inviteToken");
    expect(readPreferences()).not.toHaveProperty("inviteToken");
    expect(storageContents(localStorage)).not.toContain(rawInvite);
    expect(storageContents(sessionStorage)).not.toContain(rawInvite);
  });
});
