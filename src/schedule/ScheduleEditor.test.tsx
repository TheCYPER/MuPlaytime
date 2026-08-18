import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  MemberId,
  RoomId,
  RoomSnapshot,
  ScheduleSetId,
} from "../domain/types";
import { I18nProvider } from "../i18n/I18nProvider";
import { RoomRpcError } from "../data/repository";
import { ScheduleEditor } from "./ScheduleEditor";

const roomId = "00000000-0000-4000-8000-000000000001" as RoomId;
const memberId = "00000000-0000-4000-8000-000000000002" as MemberId;

const snapshot: RoomSnapshot = {
  roomId,
  roomName: "Friends",
  currentMemberId: memberId,
  members: [
    {
      id: memberId,
      roomId,
      displayName: "Percy",
      normalizedName: "percy",
      createdAt: "2026-08-18T00:00:00Z",
    },
  ],
  schedules: [
    {
      id: "00000000-0000-4000-8000-000000000003" as ScheduleSetId,
      roomId,
      memberId,
      timeZone: "Asia/Shanghai",
      version: 4,
      weekly: [],
      overrides: [],
    },
  ],
  proposals: [],
  changeSequence: 0,
};

describe("ScheduleEditor cross-midnight paint", () => {
  it("uses the one-day RPC when a cross-midnight range ends exactly at 00:00", async () => {
    const onReplaceWeekly = vi.fn().mockResolvedValue(undefined);
    const onReplaceWeeklyPair = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <I18nProvider>
        <ScheduleEditor
          snapshot={snapshot}
          viewerTimeZone="Asia/Shanghai"
          onViewerTimeZone={vi.fn()}
          onReplaceWeekly={onReplaceWeekly}
          onReplaceWeeklyPair={onReplaceWeeklyPair}
          onReplaceOverride={vi.fn().mockResolvedValue(undefined)}
          onReplaceOverridePair={vi.fn().mockResolvedValue(undefined)}
          onRestoreOverride={vi.fn().mockResolvedValue(undefined)}
          onMigrateZone={vi.fn().mockResolvedValue(undefined)}
          onCreateProposal={vi.fn()}
        />
      </I18nProvider>,
    );
    const weeklySection =
      container.querySelector<HTMLElement>(".editor-section");
    expect(weeklySection).not.toBeNull();
    const editor = within(weeklySection!);

    fireEvent.change(editor.getByLabelText("Start"), {
      target: { value: "23:00" },
    });
    fireEvent.change(editor.getByLabelText("End"), {
      target: { value: "00:00" },
    });
    fireEvent.click(editor.getByLabelText("End is on the next day"));
    fireEvent.click(editor.getByRole("button", { name: "Paint range" }));

    await waitFor(() => {
      expect(onReplaceWeekly).toHaveBeenCalledWith(
        expect.any(Number),
        [{ startMinute: 1380, endMinute: 1440, state: "free" }],
        4,
      );
    });
    expect(onReplaceWeeklyPair).not.toHaveBeenCalled();
  });

  it("offers the shared explicit proposal entry from personal schedule", () => {
    const onCreateProposal = vi.fn();
    render(
      <I18nProvider>
        <ScheduleEditor
          snapshot={snapshot}
          viewerTimeZone="Asia/Shanghai"
          onViewerTimeZone={vi.fn()}
          onReplaceWeekly={vi.fn().mockResolvedValue(undefined)}
          onReplaceWeeklyPair={vi.fn().mockResolvedValue(undefined)}
          onReplaceOverride={vi.fn().mockResolvedValue(undefined)}
          onReplaceOverridePair={vi.fn().mockResolvedValue(undefined)}
          onRestoreOverride={vi.fn().mockResolvedValue(undefined)}
          onMigrateZone={vi.fn().mockResolvedValue(undefined)}
          onCreateProposal={onCreateProposal}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Plan a game" }));
    expect(onCreateProposal).toHaveBeenCalledOnce();
  });

  it("keeps a rejected paint actionable when the schedule version changed", async () => {
    render(
      <I18nProvider>
        <ScheduleEditor
          snapshot={snapshot}
          viewerTimeZone="Asia/Shanghai"
          onViewerTimeZone={vi.fn()}
          onReplaceWeekly={vi
            .fn()
            .mockRejectedValue(
              new RoomRpcError("schedule_version_conflict", "40001"),
            )}
          onReplaceWeeklyPair={vi.fn().mockResolvedValue(undefined)}
          onReplaceOverride={vi.fn().mockResolvedValue(undefined)}
          onReplaceOverridePair={vi.fn().mockResolvedValue(undefined)}
          onRestoreOverride={vi.fn().mockResolvedValue(undefined)}
          onMigrateZone={vi.fn().mockResolvedValue(undefined)}
          onCreateProposal={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Paint range" })[0]!);
    expect(
      await screen.findByText(/Someone changed this schedule first/),
    ).toBeInTheDocument();
  });
});
