import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { roomSnapshotFixture } from "../test/roomSnapshot";
import { GroupBoard, type ProposedWindow } from "./GroupBoard";

function board(
  viewerTimeZone: string,
  onPropose: (value: ProposedWindow) => void,
) {
  return (
    <I18nProvider>
      <GroupBoard
        snapshot={roomSnapshotFixture()}
        viewerTimeZone={viewerTimeZone}
        onPropose={onPropose}
        onViewDetails={vi.fn()}
        onChooseDayTime={vi.fn()}
      />
    </I18nProvider>
  );
}

describe("GroupBoard absolute selection", () => {
  it("preserves the selected epochs when the viewer timezone changes", () => {
    const proposed: ProposedWindow[] = [];
    const view = render(
      board("Asia/Shanghai", (value) => proposed.push(value)),
    );

    fireEvent.click(screen.getByRole("button", { name: "Propose this time" }));
    view.rerender(board("America/New_York", (value) => proposed.push(value)));
    fireEvent.click(screen.getByRole("button", { name: "Propose this time" }));

    expect(proposed).toHaveLength(2);
    expect(proposed[1]).toMatchObject({
      startEpochMilliseconds: proposed[0]?.startEpochMilliseconds,
      endEpochMilliseconds: proposed[0]?.endEpochMilliseconds,
      sourceTimeZone: "America/New_York",
    });
  });

  it("warns when a zone change resets an unresolved boundary draft", () => {
    const proposed: ProposedWindow[] = [];
    const view = render(
      board("America/New_York", (value) => proposed.push(value)),
    );
    fireEvent.click(screen.getByRole("button", { name: "Propose this time" }));
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-11-01T01:30" },
    });
    expect(screen.getAllByRole("radio")).toHaveLength(2);

    view.rerender(board("Asia/Shanghai", (value) => proposed.push(value)));

    expect(screen.getByText(/unresolved time edit was reset/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Propose this time" }));
    expect(proposed[1]).toMatchObject({
      startEpochMilliseconds: proposed[0]?.startEpochMilliseconds,
      endEpochMilliseconds: proposed[0]?.endEpochMilliseconds,
      sourceTimeZone: "Asia/Shanghai",
    });
  });
});
