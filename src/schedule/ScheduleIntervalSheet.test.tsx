import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomRpcError } from "../data/repository";
import type { ScheduleInterval } from "../domain/types";
import { I18nProvider } from "../i18n/I18nProvider";
import {
  ScheduleIntervalSheet,
  type ScheduleIntervalContext,
} from "./ScheduleIntervalSheet";

const intervals: ScheduleInterval[] = [
  { startMinute: 360, endMinute: 420, state: "free" },
  { startMinute: 480, endMinute: 540, state: "busy" },
];

function context(
  onSave = vi.fn().mockResolvedValue(undefined),
  onSaveNextDay = vi.fn().mockResolvedValue(undefined),
): ScheduleIntervalContext {
  return {
    scope: { kind: "weekly", isoWeekday: 1 },
    mode: "edit",
    intervals,
    original: intervals[0],
    allowNextDay: true,
    openedVersion: 4,
    previousDayScope: { kind: "weekly", isoWeekday: 7 },
    previousDayIntervals: [],
    nextDayIntervals: [],
    nextDayScope: { kind: "weekly", isoWeekday: 2 },
    onSave,
    onSaveNextDay,
  };
}

function renderSheet(props: {
  context: ScheduleIntervalContext;
  latestVersion?: number;
  latestIntervals?: readonly ScheduleInterval[];
  latestPreviousDayIntervals?: readonly ScheduleInterval[];
  latestNextDayIntervals?: readonly ScheduleInterval[];
}) {
  return render(
    <I18nProvider>
      <ScheduleIntervalSheet
        context={props.context}
        online
        latestVersion={props.latestVersion ?? 4}
        latestIntervals={props.latestIntervals ?? intervals}
        latestPreviousDayIntervals={props.latestPreviousDayIntervals ?? []}
        latestNextDayIntervals={props.latestNextDayIntervals ?? []}
        onClose={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("ScheduleIntervalSheet", () => {
  it("moves a whole interval without leaving the original fragment", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSheet({ context: context(onSave) });

    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "06:30" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "07:30" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "busy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        [
          { startMinute: 390, endMinute: 450, state: "busy" },
          { startMinute: 480, endMinute: 540, state: "busy" },
        ],
        4,
      ),
    );
  });

  it("requires an in-sheet confirmation and clears only the selected interval", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSheet({ context: context(onSave) });

    fireEvent.click(screen.getByRole("button", { name: "Clear this time" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear schedule" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        [{ startMinute: 480, endMinute: 540, state: "busy" }],
        4,
      ),
    );
  });

  it("retains the draft across a version conflict and requires review before retry", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(
        new RoomRpcError("schedule_version_conflict", "40001"),
      )
      .mockResolvedValueOnce(undefined);
    const sheetContext = context(onSave);
    const view = renderSheet({ context: sheetContext });
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "06:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(/Someone changed this schedule/),
    ).toBeVisible();

    view.rerender(
      <I18nProvider>
        <ScheduleIntervalSheet
          context={sheetContext}
          online
          latestVersion={5}
          latestIntervals={intervals}
          latestPreviousDayIntervals={[]}
          latestNextDayIntervals={[]}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review and retry with latest version",
      }),
    );
    expect(save).toBeEnabled();

    view.rerender(
      <I18nProvider>
        <ScheduleIntervalSheet
          context={sheetContext}
          online
          latestVersion={6}
          latestIntervals={intervals}
          latestPreviousDayIntervals={[]}
          latestNextDayIntervals={[]}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(save).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review and retry with latest version",
      }),
    );
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(expect.any(Array), 6),
    );
    expect(screen.getByLabelText("Start")).toHaveValue("06:30");
  });

  it("blocks clear when a conflict replaced the selected fingerprint", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(
        new RoomRpcError("schedule_version_conflict", "40001"),
      );
    const sheetContext = context(onSave);
    const view = renderSheet({ context: sheetContext });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText(/Someone changed this schedule/);

    view.rerender(
      <I18nProvider>
        <ScheduleIntervalSheet
          context={sheetContext}
          online
          latestVersion={5}
          latestIntervals={[
            { startMinute: 360, endMinute: 420, state: "busy" },
            intervals[1]!,
          ]}
          latestPreviousDayIntervals={[]}
          latestNextDayIntervals={[]}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Clear this time" }),
    ).toBeDisabled();
    expect(screen.getByText(/changed or disappeared/)).toBeVisible();
  });

  it("rebases a reviewed cross-midnight retry over the latest adjacent day", async () => {
    const onSaveNextDay = vi
      .fn()
      .mockRejectedValueOnce(
        new RoomRpcError("schedule_version_conflict", "40001"),
      )
      .mockResolvedValueOnce(undefined);
    const sheetContext = {
      ...context(vi.fn().mockResolvedValue(undefined), onSaveNextDay),
      nextDayIntervals: [
        { startMinute: 300, endMinute: 360, state: "busy" as const },
      ],
    };
    const view = renderSheet({
      context: sheetContext,
      latestNextDayIntervals: sheetContext.nextDayIntervals,
    });
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "23:00" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "01:00" },
    });
    fireEvent.click(screen.getByLabelText("End is on the next day"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(/Someone changed this schedule/),
    ).toBeVisible();

    const latestAdjacent = [
      { startMinute: 120, endMinute: 180, state: "busy" as const },
    ];
    view.rerender(
      <I18nProvider>
        <ScheduleIntervalSheet
          context={sheetContext}
          online
          latestVersion={5}
          latestIntervals={intervals}
          latestPreviousDayIntervals={[]}
          latestNextDayIntervals={latestAdjacent}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    expect(screen.getAllByText(/02:00–03:00 Busy/).length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review and retry with latest version",
      }),
    );
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(onSaveNextDay).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          { startMinute: 1380, endMinute: 1440, state: "free" },
        ]),
        [
          { startMinute: 0, endMinute: 60, state: "free" },
          { startMinute: 120, endMinute: 180, state: "busy" },
        ],
        5,
      ),
    );
  });

  it("saves a next-day draft ending exactly at midnight as one day", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onSaveNextDay = vi.fn().mockResolvedValue(undefined);
    const sheetContext: ScheduleIntervalContext = {
      ...context(onSave, onSaveNextDay),
      mode: "create",
      intervals: [],
      original: undefined,
    };
    renderSheet({ context: sheetContext, latestIntervals: [] });

    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "23:00" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "00:00" },
    });
    fireEvent.click(screen.getByLabelText("End is on the next day"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        [{ startMinute: 1380, endMinute: 1440, state: "free" }],
        4,
      ),
    );
    expect(onSaveNextDay).not.toHaveBeenCalled();
  });

  it("offers a touching next-day segment explicitly and preserves its neighbors", async () => {
    const onSaveNextDay = vi.fn().mockResolvedValue(undefined);
    const currentPart = {
      startMinute: 1380,
      endMinute: 1440,
      state: "free" as const,
    };
    const nextPart = {
      startMinute: 0,
      endMinute: 60,
      state: "free" as const,
    };
    const nextNeighbor = {
      startMinute: 120,
      endMinute: 180,
      state: "busy" as const,
    };
    const sheetContext = {
      ...context(vi.fn().mockResolvedValue(undefined), onSaveNextDay),
      intervals: [currentPart],
      original: currentPart,
      nextDayIntervals: [nextPart, nextNeighbor],
    };
    renderSheet({
      context: sheetContext,
      latestIntervals: [currentPart],
      latestNextDayIntervals: [nextPart, nextNeighbor],
    });
    const adjacent = screen.getByLabelText(
      /Also edit the touching next-day segment/,
    );
    expect(adjacent).not.toBeChecked();
    expect(screen.getByLabelText("End is on the next day")).not.toBeChecked();
    fireEvent.click(adjacent);
    expect(screen.getByLabelText("Start")).toHaveValue("23:00");
    expect(screen.getByLabelText("End")).toHaveValue("01:00");
    expect(screen.getByText("Affected-day preview")).toBeVisible();
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "busy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSaveNextDay).toHaveBeenCalledWith(
        [{ startMinute: 1380, endMinute: 1440, state: "busy" }],
        [{ startMinute: 0, endMinute: 60, state: "busy" }, nextNeighbor],
        4,
      ),
    );
  });

  it("clears an explicitly selected next-day part when shortened to midnight", async () => {
    const onSaveNextDay = vi.fn().mockResolvedValue(undefined);
    const currentPart = {
      startMinute: 1380,
      endMinute: 1440,
      state: "free" as const,
    };
    const nextPart = {
      startMinute: 0,
      endMinute: 60,
      state: "free" as const,
    };
    const sheetContext = {
      ...context(vi.fn().mockResolvedValue(undefined), onSaveNextDay),
      intervals: [currentPart],
      original: currentPart,
      nextDayIntervals: [nextPart],
    };
    renderSheet({
      context: sheetContext,
      latestIntervals: [currentPart],
      latestNextDayIntervals: [nextPart],
    });

    fireEvent.click(
      screen.getByLabelText(/Also edit the touching next-day segment/),
    );
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "00:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSaveNextDay).toHaveBeenCalledWith([currentPart], [], 4),
    );
  });

  it("supports an explicit previous/current adjacent pair", async () => {
    const onSavePreviousDay = vi.fn().mockResolvedValue(undefined);
    const currentPart = {
      startMinute: 0,
      endMinute: 60,
      state: "free" as const,
    };
    const previousPart = {
      startMinute: 1380,
      endMinute: 1440,
      state: "free" as const,
    };
    const sheetContext: ScheduleIntervalContext = {
      ...context(),
      intervals: [currentPart],
      original: currentPart,
      previousDayIntervals: [previousPart],
      onSavePreviousDay,
    };
    renderSheet({
      context: sheetContext,
      latestIntervals: sheetContext.intervals,
      latestPreviousDayIntervals: [previousPart],
    });

    fireEvent.click(
      screen.getByLabelText(/Also edit the touching previous-day segment/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSavePreviousDay).toHaveBeenCalledWith(
        [previousPart],
        expect.any(Array),
        4,
      ),
    );
  });

  it("clears the current part when a previous pair is shortened to midnight", async () => {
    const onSavePreviousDay = vi.fn().mockResolvedValue(undefined);
    const currentPart = {
      startMinute: 0,
      endMinute: 60,
      state: "free" as const,
    };
    const previousPart = {
      startMinute: 1380,
      endMinute: 1440,
      state: "free" as const,
    };
    const sheetContext: ScheduleIntervalContext = {
      ...context(),
      intervals: [currentPart],
      original: currentPart,
      previousDayIntervals: [previousPart],
      onSavePreviousDay,
    };
    renderSheet({
      context: sheetContext,
      latestIntervals: [currentPart],
      latestPreviousDayIntervals: [previousPart],
    });

    fireEvent.click(
      screen.getByLabelText(/Also edit the touching previous-day segment/),
    );
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "00:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSavePreviousDay).toHaveBeenCalledWith([previousPart], [], 4),
    );
  });

  it("rejects combining previous/current/next into a three-day draft", () => {
    const fullDay = {
      startMinute: 0,
      endMinute: 1440,
      state: "free" as const,
    };
    const previousPart = {
      startMinute: 1380,
      endMinute: 1440,
      state: "free" as const,
    };
    const nextPart = {
      startMinute: 0,
      endMinute: 60,
      state: "free" as const,
    };
    const sheetContext: ScheduleIntervalContext = {
      ...context(),
      intervals: [fullDay],
      original: fullDay,
      previousDayIntervals: [previousPart],
      nextDayIntervals: [nextPart],
    };
    renderSheet({
      context: sheetContext,
      latestIntervals: [fullDay],
      latestPreviousDayIntervals: [previousPart],
      latestNextDayIntervals: [nextPart],
    });

    fireEvent.click(screen.getByLabelText("End is on the next day"));
    expect(
      screen.getByLabelText(/Also edit the touching previous-day segment/),
    ).toBeDisabled();
    expect(screen.getByText(/affect three days/)).toBeVisible();
  });

  it("does not infer that a stored midnight-ending part crosses days", () => {
    renderSheet({
      context: {
        ...context(),
        intervals: [{ startMinute: 1380, endMinute: 1440, state: "free" }],
        original: { startMinute: 1380, endMinute: 1440, state: "free" },
      },
      latestIntervals: [{ startMinute: 1380, endMinute: 1440, state: "free" }],
    });

    expect(screen.getByLabelText("End is on the next day")).not.toBeChecked();
  });

  it("treats midnight as the current-day boundary when editing a stored part", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const midnightPart = {
      startMinute: 1380,
      endMinute: 1440,
      state: "free" as const,
    };
    renderSheet({
      context: {
        ...context(onSave),
        intervals: [midnightPart],
        original: midnightPart,
      },
      latestIntervals: [midnightPart],
    });

    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "busy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        [{ startMinute: 1380, endMinute: 1440, state: "busy" }],
        4,
      ),
    );
  });
});
