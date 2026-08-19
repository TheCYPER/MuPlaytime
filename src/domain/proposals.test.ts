import { describe, expect, it } from "vitest";
import type {
  MemberId,
  OptionId,
  RoomId,
  ThresholdWatch,
  WatchId,
} from "./types";
import { selectPresentedWatch } from "./proposals";

const roomId = "00000000-0000-4000-8000-000000000001" as RoomId;
const optionId = "00000000-0000-4000-8000-000000000002" as OptionId;
const memberId = "00000000-0000-4000-8000-000000000003" as MemberId;

function watch(
  input: Partial<ThresholdWatch> & Pick<ThresholdWatch, "id" | "createdAt">,
): ThresholdWatch {
  return {
    roomId,
    optionId,
    memberId,
    threshold: 2,
    triggeredAt: null,
    acknowledgedAt: null,
    closedAt: null,
    closeReason: null,
    ...input,
  };
}

describe("selectPresentedWatch", () => {
  it("does not let an older expired generation hide the current active one", () => {
    const expired = watch({
      id: "00000000-0000-4000-8000-000000000004" as WatchId,
      createdAt: "2026-01-01T00:00:00Z",
      closedAt: "2026-01-02T00:00:00Z",
      closeReason: "not_selected",
    });
    const active = watch({
      id: "00000000-0000-4000-8000-000000000005" as WatchId,
      createdAt: "2026-02-01T00:00:00Z",
    });
    expect(
      selectPresentedWatch([expired, active], optionId, memberId)?.id,
    ).toBe(active.id);
  });

  it("prioritizes an unacknowledged trigger after proposal closure", () => {
    const active = watch({
      id: "00000000-0000-4000-8000-000000000006" as WatchId,
      createdAt: "2026-03-01T00:00:00Z",
    });
    const triggered = watch({
      id: "00000000-0000-4000-8000-000000000007" as WatchId,
      createdAt: "2026-02-01T00:00:00Z",
      triggeredAt: "2026-02-02T00:00:00Z",
      closedAt: "2026-02-03T00:00:00Z",
    });
    expect(
      selectPresentedWatch([active, triggered], optionId, memberId)?.id,
    ).toBe(triggered.id);
  });
});
