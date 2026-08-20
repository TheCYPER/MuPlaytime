import { Temporal } from "@js-temporal/polyfill";
import { useState } from "react";
import { GroupBoard } from "../board/GroupBoard";
import { SelectionDetailSheet } from "../board/SelectionDetailSheet";
import type { InstantRange } from "../board/selection";
import { I18nProvider } from "../i18n/I18nProvider";
import { ProposalPanel } from "../proposals/ProposalPanel";
import { ClaimForm, EntryFrame } from "../rooms/EntryPages";
import { ScheduleEditor } from "../schedule/ScheduleEditor";
import { ModalSheet } from "../ui/ModalSheet";
import { Shell } from "../app/Shell";
import { App } from "../app/App";
import { InviteSheet } from "../app/InviteSheet";
import { RoomActionsSheet } from "../app/RoomActionsSheet";
import { RoomStatusRegion } from "../app/RoomStatusRegion";
import {
  ScheduleIntervalSheet,
  type ScheduleIntervalContext,
} from "../schedule/ScheduleIntervalSheet";
import { ProposalDetailSheet } from "../proposals/ProposalDetailSheet";
import { ProposalForm } from "../proposals/ProposalForm";
import { roomSnapshotFixture } from "./roomSnapshot";

const snapshot = roomSnapshotFixture();
const resolved = () => Promise.resolve();

export function EntryStory({ mode = "create" }: { mode?: "create" | "join" }) {
  return (
    <I18nProvider>
      <EntryFrame>
        <ClaimForm mode={mode} onSubmit={resolved} />
        <a className="resume-link" href="#resume">
          Resume previous room →
        </a>
      </EntryFrame>
    </I18nProvider>
  );
}

export function ConfigurationStateStory() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}

export function ShellStory({
  boardTimeZone = "Asia/Shanghai",
}: {
  boardTimeZone?: string;
}) {
  const [more, setMore] = useState(false);
  const [viewerTimeZone, setViewerTimeZone] = useState(
    "America/Argentina/Buenos_Aires",
  );
  return (
    <I18nProvider>
      <Shell
        snapshot={snapshot}
        view="group"
        viewerTimeZone={viewerTimeZone}
        onViewerTimeZone={setViewerTimeZone}
        onInvite={() => undefined}
        onMore={() => setMore(true)}
      >
        <GroupBoard
          snapshot={snapshot}
          viewerTimeZone={boardTimeZone}
          onPropose={() => undefined}
          onViewDetails={() => undefined}
          onChooseDayTime={() => undefined}
        />
        {more && (
          <ModalSheet title="More" onClose={() => setMore(false)}>
            <RoomActionsSheet
              snapshot={snapshot}
              viewerTimeZone={viewerTimeZone}
              onViewerTimeZone={setViewerTimeZone}
              onInvite={() => undefined}
            />
          </ModalSheet>
        )}
      </Shell>
    </I18nProvider>
  );
}

export function ScheduleStory({
  withOverride = false,
  withAdjacentSegments = false,
  online = true,
  statusError = false,
}: {
  withOverride?: boolean;
  withAdjacentSegments?: boolean;
  online?: boolean;
  statusError?: boolean;
}) {
  const [context, setContext] = useState<ScheduleIntervalContext | null>(null);
  const currentLocalDate = Temporal.Now.plainDateISO().toString();
  const overrideSnapshot = withOverride
    ? {
        ...snapshot,
        schedules: snapshot.schedules.map((schedule) =>
          schedule.memberId === snapshot.currentMemberId
            ? {
                ...schedule,
                overrides: [
                  ...schedule.overrides,
                  {
                    localDate: currentLocalDate,
                    version: schedule.version,
                    intervals: [
                      {
                        startMinute: 720,
                        endMinute: 780,
                        state: "free" as const,
                      },
                    ],
                  },
                ],
              }
            : schedule,
        ),
      }
    : snapshot;
  const scheduleSnapshot = withAdjacentSegments
    ? {
        ...overrideSnapshot,
        schedules: overrideSnapshot.schedules.map((schedule) =>
          schedule.memberId === snapshot.currentMemberId
            ? {
                ...schedule,
                weekly: [
                  ...schedule.weekly,
                  {
                    isoWeekday: 1 as const,
                    startMinute: 1320,
                    endMinute: 1440,
                    state: "free" as const,
                  },
                  {
                    isoWeekday: 2 as const,
                    startMinute: 0,
                    endMinute: 60,
                    state: "free" as const,
                  },
                ],
              }
            : schedule,
        ),
      }
    : overrideSnapshot;
  return (
    <I18nProvider>
      <ScheduleEditor
        snapshot={scheduleSnapshot}
        viewerTimeZone="Asia/Shanghai"
        online={online}
        onViewerTimeZone={() => undefined}
        onReplaceWeekly={resolved}
        onReplaceWeeklyPair={resolved}
        onReplaceOverride={resolved}
        onReplaceOverridePair={resolved}
        onRestoreOverride={resolved}
        onMigrateZone={resolved}
        onCreateProposal={() => undefined}
        onOpenInterval={setContext}
        onOpenTimezone={() => undefined}
      />
      {context && (
        <ModalSheet title="Edit schedule time" onClose={() => setContext(null)}>
          {(!online || statusError) && (
            <RoomStatusRegion
              online={online}
              checking={false}
              error={statusError}
              onRetry={() => undefined}
            />
          )}
          <ScheduleIntervalSheet
            context={context}
            online={online}
            latestVersion={context.openedVersion}
            latestIntervals={context.intervals}
            latestPreviousDayIntervals={context.previousDayIntervals}
            latestNextDayIntervals={context.nextDayIntervals}
            onClose={() => setContext(null)}
          />
        </ModalSheet>
      )}
    </I18nProvider>
  );
}

export function ProposalStory() {
  return (
    <I18nProvider>
      <ProposalPanel
        snapshot={snapshot}
        viewerTimeZone="Asia/Shanghai"
        online
        onCreateProposal={() => undefined}
        onSuggestTime={() => undefined}
        actions={{
          addOption: resolved,
          respond: resolved,
          confirm: resolved,
          rename: resolved,
          cancel: resolved,
          withdrawOption: resolved,
          setWatch: resolved,
          acknowledgeWatch: resolved,
        }}
      />
    </I18nProvider>
  );
}

export function InviteModalStory({
  token = "a".repeat(64),
}: {
  token?: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Open invite
      </button>
      {open && (
        <ModalSheet title="Invite" onClose={() => setOpen(false)}>
          <InviteSheet token={token} />
        </ModalSheet>
      )}
    </I18nProvider>
  );
}

export function ProposalDetailStory({
  failActions = false,
  online = true,
}: {
  failActions?: boolean;
  online?: boolean;
}) {
  const proposal = snapshot.proposals[0];
  if (!proposal) return null;
  const action = failActions
    ? () => Promise.reject(new Error("story action failed"))
    : resolved;
  return (
    <I18nProvider>
      <ModalSheet title={proposal.gameName} onClose={() => undefined}>
        <ProposalDetailSheet
          proposal={proposal}
          snapshot={snapshot}
          viewerTimeZone="Asia/Shanghai"
          online={online}
          onSuggestTime={() => undefined}
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
      </ModalSheet>
    </I18nProvider>
  );
}

export function SelectionDetailStory() {
  const [mode, setMode] = useState<"detail" | "proposal">("detail");
  const range: InstantRange = {
    startEpochMilliseconds: Date.parse("2026-08-24T11:30:00Z"),
    endEpochMilliseconds: Date.parse("2026-08-24T13:30:00Z"),
  };
  return (
    <I18nProvider>
      <ModalSheet
        title={mode === "detail" ? "Selected window" : "Plan a game"}
        focusKey={mode}
        onClose={() => undefined}
        footer={
          mode === "detail" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => setMode("proposal")}
            >
              Propose this time
            </button>
          ) : undefined
        }
      >
        {mode === "detail" ? (
          <SelectionDetailSheet
            snapshot={snapshot}
            range={range}
            viewerTimeZone="Asia/Shanghai"
          />
        ) : (
          <ProposalForm
            mode="proposal"
            online
            viewerTimeZone="Asia/Shanghai"
            defaultWindow={{ ...range, sourceTimeZone: "Asia/Shanghai" }}
            onSubmit={resolved}
            onClose={() => undefined}
          />
        )}
      </ModalSheet>
    </I18nProvider>
  );
}
