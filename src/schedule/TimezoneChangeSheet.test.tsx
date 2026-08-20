import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomRpcError } from "../data/repository";
import { I18nProvider } from "../i18n/I18nProvider";
import { roomSnapshotFixture } from "../test/roomSnapshot";
import { TimezoneChangeSheet } from "./TimezoneChangeSheet";

function renderSheet(online = true) {
  const schedule = roomSnapshotFixture().schedules[0]!;
  const onViewerTimeZone = vi.fn();
  const onMigrateZone = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <TimezoneChangeSheet
        schedule={schedule}
        viewerTimeZone="Asia/Shanghai"
        online={online}
        context={{ onViewerTimeZone, onMigrateZone }}
        onClose={onClose}
      />
    </I18nProvider>,
  );
  return { onViewerTimeZone, onMigrateZone, onClose, schedule };
}

describe("TimezoneChangeSheet", () => {
  it("changes only the viewer zone in keep-anchor mode", () => {
    const { onViewerTimeZone, onMigrateZone, onClose } = renderSheet();
    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Asia/Tokyo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change my view" }));

    expect(onViewerTimeZone).toHaveBeenCalledWith("Asia/Tokyo");
    expect(onMigrateZone).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the opened schedule version only after explicit migration choice", async () => {
    const { onViewerTimeZone, onMigrateZone, schedule } = renderSheet();
    fireEvent.click(
      screen.getByLabelText("Migrate schedule and preserve local clock times"),
    );
    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Asia/Tokyo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm migration" }));

    await waitFor(() =>
      expect(onMigrateZone).toHaveBeenCalledWith(
        "Asia/Tokyo",
        schedule.version,
      ),
    );
    expect(onViewerTimeZone).not.toHaveBeenCalled();
  });

  it("keeps view-only changes available offline while disabling migration", () => {
    renderSheet(false);
    const [viewOnly, migrate] = screen.getAllByRole("radio");
    expect(viewOnly).toBeDefined();
    expect(migrate).toBeDefined();
    fireEvent.click(migrate!);
    expect(
      screen.getByRole("button", { name: "Confirm migration" }),
    ).toBeDisabled();
    fireEvent.click(viewOnly!);
    expect(
      screen.getByRole("button", { name: "Change my view" }),
    ).toBeEnabled();
  });

  it("retains the migration draft and binds conflict review to the refreshed version", async () => {
    const schedule = roomSnapshotFixture().schedules[0]!;
    const onMigrateZone = vi
      .fn()
      .mockRejectedValueOnce(
        new RoomRpcError("schedule_version_conflict", "40001"),
      )
      .mockResolvedValue(undefined);
    const context = {
      onViewerTimeZone: vi.fn(),
      onMigrateZone,
    };
    const onClose = vi.fn();
    const view = render(
      <I18nProvider>
        <TimezoneChangeSheet
          schedule={schedule}
          viewerTimeZone="Asia/Shanghai"
          online
          context={context}
          onClose={onClose}
        />
      </I18nProvider>,
    );
    fireEvent.click(
      screen.getByLabelText("Migrate schedule and preserve local clock times"),
    );
    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Asia/Tokyo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm migration" }));

    expect(
      await screen.findByText(/Someone changed this schedule/),
    ).toBeVisible();
    expect(onMigrateZone).toHaveBeenLastCalledWith(
      "Asia/Tokyo",
      schedule.version,
    );
    expect(
      screen.getByRole("button", {
        name: "Review and retry with latest version",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Confirm migration" }),
    ).toBeDisabled();

    const refreshed = { ...schedule, version: schedule.version + 1 };
    view.rerender(
      <I18nProvider>
        <TimezoneChangeSheet
          schedule={refreshed}
          viewerTimeZone="Asia/Shanghai"
          online
          context={context}
          onClose={onClose}
        />
      </I18nProvider>,
    );
    expect(screen.getByLabelText("Timezone")).toHaveValue("Asia/Tokyo");
    expect(
      screen.getByRole("button", { name: "Confirm migration" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review and retry with latest version",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm migration" }));

    await waitFor(() =>
      expect(onMigrateZone).toHaveBeenLastCalledWith(
        "Asia/Tokyo",
        refreshed.version,
      ),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
