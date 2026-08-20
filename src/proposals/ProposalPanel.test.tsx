import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberId, RoomId, RoomSnapshot } from "../domain/types";
import { I18nProvider } from "../i18n/I18nProvider";
import { roomSnapshotFixture } from "../test/roomSnapshot";
import { ProposalPanel } from "./ProposalPanel";

const originalMatchMedia = window.matchMedia?.bind(window);

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

function proposalActions() {
  return {
    addOption: vi.fn().mockResolvedValue(undefined),
    respond: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    withdrawOption: vi.fn().mockResolvedValue(undefined),
    setWatch: vi.fn().mockResolvedValue(undefined),
    acknowledgeWatch: vi.fn().mockResolvedValue(undefined),
  };
}

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
          onSuggestTime={vi.fn()}
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

  it("blocks an option confirmation when the connection drops after review opens", () => {
    const snapshot = roomSnapshotFixture();
    const actions = proposalActions();
    const props = {
      snapshot,
      viewerTimeZone: "UTC",
      actions,
      onCreateProposal: vi.fn(),
      onSuggestTime: vi.fn(),
    };
    const view = render(
      <I18nProvider>
        <ProposalPanel {...props} online />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm this time" }));
    view.rerender(
      <I18nProvider>
        <ProposalPanel {...props} online={false} />
      </I18nProvider>,
    );

    const confirm = screen.getByRole("button", { name: "Confirm action" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it("blocks proposal cancellation when the connection drops after review opens", () => {
    const snapshot = roomSnapshotFixture();
    const actions = proposalActions();
    const props = {
      snapshot,
      viewerTimeZone: "UTC",
      actions,
      onCreateProposal: vi.fn(),
      onSuggestTime: vi.fn(),
    };
    const view = render(
      <I18nProvider>
        <ProposalPanel {...props} online />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel proposal" }));
    view.rerender(
      <I18nProvider>
        <ProposalPanel {...props} online={false} />
      </I18nProvider>,
    );

    const confirm = screen.getByRole("button", { name: "Confirm action" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(actions.cancel).not.toHaveBeenCalled();
  });

  it("keeps mobile history collapsed behind an explicit disclosure", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 840px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const fixture = roomSnapshotFixture();
    const gameName = fixture.proposals[0]!.gameName;
    const historyOnly = {
      ...fixture,
      proposals: fixture.proposals.map((proposal) => ({
        ...proposal,
        status: "cancelled" as const,
      })),
    };

    const view = render(
      <I18nProvider>
        <ProposalPanel
          snapshot={historyOnly}
          viewerTimeZone="UTC"
          actions={proposalActions()}
          onCreateProposal={vi.fn()}
          onSuggestTime={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/No active proposals right now/)).toBeVisible();
    const disclosure = screen.getByRole("button", {
      name: /Show History.*1/,
    });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: new RegExp(gameName) }),
    ).toBeNull();
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(
      screen
        .getAllByRole("link", { name: new RegExp(gameName) })
        .some((link) => link.classList.contains("proposal-mobile-summary")),
    ).toBe(true);
    view.unmount();
  });

  it("auto-expands a selected history item and restores the disclosure after close", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 840px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const fixture = roomSnapshotFixture();
    const proposal = { ...fixture.proposals[0]!, status: "cancelled" as const };
    const snapshot = { ...fixture, proposals: [proposal] };
    const props = {
      snapshot,
      viewerTimeZone: "UTC",
      actions: proposalActions(),
      onCreateProposal: vi.fn(),
      onSuggestTime: vi.fn(),
    };
    const view = render(
      <I18nProvider>
        <ProposalPanel {...props} selectedProposalId={proposal.id} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Hide History.*1/ }),
    ).toHaveAttribute("aria-expanded", "true");

    view.rerender(
      <I18nProvider>
        <ProposalPanel {...props} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Show History.*1/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: new RegExp(proposal.gameName) }),
    ).toBeNull();
  });

  it("summarizes a scheduled proposal by its confirmed option", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 840px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const fixture = roomSnapshotFixture();
    const first = fixture.proposals[0]!.options[0]!;
    const secondId = "00000000-0000-4000-8000-000000000012" as typeof first.id;
    const proposal = {
      ...fixture.proposals[0]!,
      status: "scheduled" as const,
      confirmedOptionId: secondId,
      options: [
        first,
        {
          ...first,
          id: secondId,
          startsAt: "2026-08-25T16:00:00Z",
          sourceLocalStart: "2026-08-25T20:00",
        },
      ],
      responses: [
        ...fixture.proposals[0]!.responses,
        {
          ...fixture.proposals[0]!.responses[0]!,
          memberId: fixture.currentMemberId,
          updatedAt: "2026-08-19T02:00:00Z",
        },
        {
          ...fixture.proposals[0]!.responses[0]!,
          optionId: secondId,
          updatedAt: "2026-08-19T03:00:00Z",
        },
      ],
    };
    const snapshot = { ...fixture, proposals: [proposal] };

    render(
      <I18nProvider>
        <ProposalPanel
          snapshot={snapshot}
          viewerTimeZone="UTC"
          actions={proposalActions()}
          onCreateProposal={vi.fn()}
          onSuggestTime={vi.fn()}
        />
      </I18nProvider>,
    );

    const summary = screen
      .getAllByRole("link", { name: new RegExp(proposal.gameName) })
      .find((link) => link.classList.contains("proposal-mobile-summary"))!;
    expect(summary).toHaveTextContent(/Aug 25.*04:00 PM.*1 accepted/);
    const scheduleLine = summary.querySelector("small");
    expect(scheduleLine).not.toHaveTextContent(/2 options/);
    expect(scheduleLine).not.toHaveTextContent(/2 accepted/);
  });
});
