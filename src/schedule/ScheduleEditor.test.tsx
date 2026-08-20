import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Temporal } from "@js-temporal/polyfill";
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
          onOpenInterval={vi.fn()}
          onOpenTimezone={vi.fn()}
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
          onOpenInterval={vi.fn()}
          onOpenTimezone={vi.fn()}
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
          onOpenInterval={vi.fn()}
          onOpenTimezone={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Paint range" })[0]!);
    expect(
      await screen.findByText(/Someone changed this schedule first/),
    ).toBeInTheDocument();
  });

  it("retains and explicitly reviews quick-paint operations over a refreshed version", async () => {
    const onReplaceWeekly = vi.fn().mockResolvedValue(undefined);
    const props = {
      viewerTimeZone: "Asia/Shanghai",
      onViewerTimeZone: vi.fn(),
      onReplaceWeekly,
      onReplaceWeeklyPair: vi.fn().mockResolvedValue(undefined),
      onReplaceOverride: vi.fn().mockResolvedValue(undefined),
      onReplaceOverridePair: vi.fn().mockResolvedValue(undefined),
      onRestoreOverride: vi.fn().mockResolvedValue(undefined),
      onMigrateZone: vi.fn().mockResolvedValue(undefined),
      onCreateProposal: vi.fn(),
      onOpenInterval: vi.fn(),
      onOpenTimezone: vi.fn(),
    };
    const view = render(
      <I18nProvider>
        <ScheduleEditor snapshot={snapshot} {...props} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /16:00–16:30/ })[0]!);
    const weeklySave = screen.getAllByRole("button", {
      name: "Save changes",
    })[0]!;
    expect(weeklySave).toBeEnabled();

    const refreshed = {
      ...snapshot,
      schedules: snapshot.schedules.map((schedule) => ({
        ...schedule,
        version: 5,
      })),
    } satisfies RoomSnapshot;
    view.rerender(
      <I18nProvider>
        <ScheduleEditor snapshot={refreshed} {...props} />
      </I18nProvider>,
    );

    expect(weeklySave).toBeDisabled();
    expect(
      screen.getByText(/saved day changed while this draft was open/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Use this reviewed rebased draft",
      }),
    );
    expect(weeklySave).toBeEnabled();
    fireEvent.click(weeklySave);
    await waitFor(() =>
      expect(onReplaceWeekly).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Array),
        5,
      ),
    );
  });

  it("requires review before rebasing an explicit range over a newer day", async () => {
    const onReplaceWeekly = vi.fn().mockResolvedValue(undefined);
    const props = {
      viewerTimeZone: "Asia/Shanghai",
      onViewerTimeZone: vi.fn(),
      onReplaceWeekly,
      onReplaceWeeklyPair: vi.fn().mockResolvedValue(undefined),
      onReplaceOverride: vi.fn().mockResolvedValue(undefined),
      onReplaceOverridePair: vi.fn().mockResolvedValue(undefined),
      onRestoreOverride: vi.fn().mockResolvedValue(undefined),
      onMigrateZone: vi.fn().mockResolvedValue(undefined),
      onCreateProposal: vi.fn(),
      onOpenInterval: vi.fn(),
      onOpenTimezone: vi.fn(),
    };
    const view = render(
      <I18nProvider>
        <ScheduleEditor snapshot={snapshot} {...props} />
      </I18nProvider>,
    );
    const weeklySection =
      view.container.querySelector<HTMLElement>(".editor-section")!;
    const editor = within(weeklySection);
    fireEvent.change(editor.getByLabelText("Start"), {
      target: { value: "18:30" },
    });

    const selectedWeekday = Temporal.Now.plainDateISO().dayOfWeek;
    const refreshed = {
      ...snapshot,
      schedules: snapshot.schedules.map((schedule) => ({
        ...schedule,
        version: 5,
        weekly: [
          {
            isoWeekday: selectedWeekday,
            startMinute: 1140,
            endMinute: 1200,
            state: "busy" as const,
          },
        ],
      })),
    } satisfies RoomSnapshot;
    view.rerender(
      <I18nProvider>
        <ScheduleEditor snapshot={refreshed} {...props} />
      </I18nProvider>,
    );

    const paint = editor.getByRole("button", { name: "Paint range" });
    expect(paint).toBeDisabled();
    expect(
      editor.getByText(/saved day changed while this range was being edited/),
    ).toBeVisible();
    expect(editor.getByText(/19:00–20:00 Busy/)).toBeVisible();
    expect(onReplaceWeekly).not.toHaveBeenCalled();

    fireEvent.click(
      editor.getByRole("button", {
        name: "Use this reviewed rebased draft",
      }),
    );
    expect(paint).toBeEnabled();
    fireEvent.click(paint);

    await waitFor(() =>
      expect(onReplaceWeekly).toHaveBeenCalledWith(
        selectedWeekday,
        [{ startMinute: 1110, endMinute: 1200, state: "free" }],
        5,
      ),
    );
  });

  it("blocks restoring a date override when the connection drops after review opens", () => {
    const localDate = Temporal.Now.plainDateISO().toString();
    const withOverride = {
      ...snapshot,
      schedules: snapshot.schedules.map((schedule) => ({
        ...schedule,
        overrides: [
          {
            localDate,
            version: schedule.version,
            intervals: [
              { startMinute: 720, endMinute: 780, state: "free" as const },
            ],
          },
        ],
      })),
    } satisfies RoomSnapshot;
    const onRestoreOverride = vi.fn().mockResolvedValue(undefined);
    const props = {
      snapshot: withOverride,
      viewerTimeZone: "Asia/Shanghai",
      onViewerTimeZone: vi.fn(),
      onReplaceWeekly: vi.fn().mockResolvedValue(undefined),
      onReplaceWeeklyPair: vi.fn().mockResolvedValue(undefined),
      onReplaceOverride: vi.fn().mockResolvedValue(undefined),
      onReplaceOverridePair: vi.fn().mockResolvedValue(undefined),
      onRestoreOverride,
      onMigrateZone: vi.fn().mockResolvedValue(undefined),
      onCreateProposal: vi.fn(),
      onOpenInterval: vi.fn(),
      onOpenTimezone: vi.fn(),
    };
    const view = render(
      <I18nProvider>
        <ScheduleEditor {...props} online />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Restore weekly template" }),
    );
    view.rerender(
      <I18nProvider>
        <ScheduleEditor {...props} online={false} />
      </I18nProvider>,
    );

    const confirm = screen.getByRole("button", { name: "Confirm action" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onRestoreOverride).not.toHaveBeenCalled();
  });

  it("invalidates restore confirmation when the schedule version changes", async () => {
    const localDate = Temporal.Now.plainDateISO().toString();
    const scheduleWithOverride = {
      ...snapshot.schedules[0]!,
      overrides: [
        {
          localDate,
          version: snapshot.schedules[0]!.version,
          intervals: [
            { startMinute: 720, endMinute: 780, state: "free" as const },
          ],
        },
      ],
    };
    const onRestoreOverride = vi.fn().mockResolvedValue(undefined);
    const props = {
      viewerTimeZone: "Asia/Shanghai",
      onViewerTimeZone: vi.fn(),
      onReplaceWeekly: vi.fn().mockResolvedValue(undefined),
      onReplaceWeeklyPair: vi.fn().mockResolvedValue(undefined),
      onReplaceOverride: vi.fn().mockResolvedValue(undefined),
      onReplaceOverridePair: vi.fn().mockResolvedValue(undefined),
      onRestoreOverride,
      onMigrateZone: vi.fn().mockResolvedValue(undefined),
      onCreateProposal: vi.fn(),
      onOpenInterval: vi.fn(),
      onOpenTimezone: vi.fn(),
    };
    const initial = {
      ...snapshot,
      schedules: [scheduleWithOverride, ...snapshot.schedules.slice(1)],
    } satisfies RoomSnapshot;
    const view = render(
      <I18nProvider>
        <ScheduleEditor {...props} snapshot={initial} online />
      </I18nProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Restore weekly template" }),
    );

    const refreshedSchedule = {
      ...scheduleWithOverride,
      version: scheduleWithOverride.version + 1,
      overrides: [
        {
          ...scheduleWithOverride.overrides[0]!,
          version: scheduleWithOverride.version + 1,
          intervals: [
            { startMinute: 750, endMinute: 810, state: "busy" as const },
          ],
        },
      ],
    };
    view.rerender(
      <I18nProvider>
        <ScheduleEditor
          {...props}
          snapshot={{
            ...snapshot,
            schedules: [refreshedSchedule, ...snapshot.schedules.slice(1)],
          }}
          online
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: "Confirm action" })).toBeNull();
    expect(screen.getByText(/Someone changed this schedule/)).toBeVisible();
    expect(onRestoreOverride).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Restore weekly template" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));

    await waitFor(() =>
      expect(onRestoreOverride).toHaveBeenCalledWith(
        localDate,
        refreshedSchedule.version,
      ),
    );
  });
});
