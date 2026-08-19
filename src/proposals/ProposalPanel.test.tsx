import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MemberId, RoomId, RoomSnapshot } from "../domain/types";
import { I18nProvider } from "../i18n/I18nProvider";
import { ProposalPanel } from "./ProposalPanel";

describe("ProposalPanel", () => {
  it("offers an explicit new-proposal entry even when the list is empty", () => {
    const onCreateProposal = vi.fn();
    const snapshot = {
      roomId: "00000000-0000-4000-8000-000000000001" as RoomId,
      roomName: "Friends",
      currentMemberId: "00000000-0000-4000-8000-000000000002" as MemberId,
      members: [],
      schedules: [],
      proposals: [],
      changeSequence: 0,
    } satisfies RoomSnapshot;
    const action = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <ProposalPanel
          snapshot={snapshot}
          viewerTimeZone="UTC"
          onCreateProposal={onCreateProposal}
          actions={{
            addOption: action,
            respond: action,
            confirm: action,
            rename: action,
            cancel: action,
            withdrawOption: action,
            setWatch: action,
            acknowledgeWatch: action,
          }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Plan a game" }));
    expect(onCreateProposal).toHaveBeenCalledOnce();
  });
});
