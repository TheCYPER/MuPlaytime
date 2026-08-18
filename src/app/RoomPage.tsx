import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConcreteOptionInput, RoomRepository } from "../data/repository";
import { roomKeys, invalidateRoom } from "../data/query";
import type {
  OptionId,
  ProposalId,
  ResponseChoice,
  RoomId,
  ScheduleInterval,
  WatchId,
} from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { GroupBoard, type ProposedWindow } from "../board/GroupBoard";
import { ProposalForm } from "../proposals/ProposalForm";
import { ProposalPanel } from "../proposals/ProposalPanel";
import { subscribeToRoomChanges } from "../realtime/roomRealtime";
import { ScheduleEditor } from "../schedule/ScheduleEditor";
import { LiveStatus } from "../ui/LiveStatus";
import { useDialogFocus } from "../ui/useDialogFocus";
import { InviteSheet } from "./InviteSheet";
import { Shell } from "./Shell";
import { writePreferences } from "./preferences";

export function RoomPage({
  roomId,
  view,
  repository,
  supabase,
  viewerTimeZone,
  onViewerTimeZone,
  inviteToken,
}: {
  roomId: RoomId;
  view: "group" | "schedule" | "proposals";
  repository: RoomRepository;
  supabase: SupabaseClient;
  viewerTimeZone: string;
  onViewerTimeZone: (zone: string) => void;
  inviteToken: string | null;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [inviteRequested, setInviteRequested] = useState(false);
  const [dismissedInviteToken, setDismissedInviteToken] = useState<
    string | null
  >(null);
  const [proposalDraft, setProposalDraft] = useState<{
    defaultWindow?: ProposedWindow;
  } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const inviteOpen =
    inviteRequested ||
    (inviteToken !== null && dismissedInviteToken !== inviteToken);
  const closeInvite = () => {
    setInviteRequested(false);
    if (inviteToken) setDismissedInviteToken(inviteToken);
  };
  const proposalDialogRef = useDialogFocus<HTMLElement>(
    proposalDraft !== null,
    () => setProposalDraft(null),
  );
  const query = useQuery({
    queryKey: roomKeys.snapshot(roomId),
    queryFn: () => repository.snapshot(roomId),
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSettled: () => invalidateRoom(queryClient, roomId),
  });

  useEffect(
    () => subscribeToRoomChanges(supabase, queryClient, roomId),
    [supabase, queryClient, roomId],
  );
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  useEffect(() => {
    if (query.data) {
      writePreferences({
        lastRoomId: query.data.roomId,
        lastMemberId: query.data.currentMemberId,
        viewerTimeZone,
        lastView: view,
      });
    }
  }, [query.data, viewerTimeZone, view]);

  const run = useMemo(
    () => async (operation: () => Promise<unknown>) => {
      await mutation.mutateAsync(operation);
    },
    [mutation],
  );

  if (query.isPending)
    return (
      <main className="state-page">
        <div className="loader" />
        <p>{t("loading")}</p>
      </main>
    );
  if (query.isError || !query.data)
    return (
      <main className="state-page">
        <h1>{t("serviceError")}</h1>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void query.refetch()}
        >
          {t("retry")}
        </button>
      </main>
    );
  const snapshot = query.data;

  const proposalActions = {
    addOption: (proposalId: ProposalId, option: ConcreteOptionInput) =>
      run(() => repository.addOption(roomId, proposalId, option)),
    respond: (optionId: OptionId, response: ResponseChoice | null) =>
      run(() => repository.respond(roomId, optionId, response)),
    confirm: (proposalId: ProposalId, optionId: OptionId) =>
      run(() => repository.confirm(roomId, proposalId, optionId)),
    rename: (proposalId: ProposalId, gameName: string) =>
      run(() => repository.rename(roomId, proposalId, gameName)),
    cancel: (proposalId: ProposalId) =>
      run(() => repository.cancel(roomId, proposalId)),
    withdrawOption: (optionId: OptionId) =>
      run(() => repository.withdrawOption(roomId, optionId)),
    setWatch: (optionId: OptionId, threshold: number) =>
      run(() => repository.setWatch(roomId, optionId, threshold)),
    acknowledgeWatch: (watchId: WatchId) =>
      run(() => repository.acknowledgeWatch(roomId, watchId)),
  };

  return (
    <Shell
      snapshot={snapshot}
      view={view}
      viewerTimeZone={viewerTimeZone}
      onViewerTimeZone={onViewerTimeZone}
      onInvite={() => setInviteRequested(true)}
    >
      {!online && <div className="connection-banner">{t("offline")}</div>}
      {mutation.isPending && (
        <div className="connection-banner saving">{t("saving")}</div>
      )}
      {mutation.isError && !mutation.isPending && (
        <div className="connection-banner" role="alert">
          {t("serviceError")}
        </div>
      )}
      <LiveStatus
        message={
          mutation.isPending
            ? t("saving")
            : mutation.isError
              ? t("serviceError")
              : ""
        }
      />
      {view === "group" && (
        <GroupBoard
          snapshot={snapshot}
          viewerTimeZone={viewerTimeZone}
          onPropose={(defaultWindow) => setProposalDraft({ defaultWindow })}
        />
      )}
      {view === "schedule" && (
        <ScheduleEditor
          snapshot={snapshot}
          viewerTimeZone={viewerTimeZone}
          onViewerTimeZone={onViewerTimeZone}
          onCreateProposal={() => setProposalDraft({})}
          onReplaceWeekly={(
            isoWeekday: number,
            intervals: ScheduleInterval[],
            version: number,
          ) =>
            run(() =>
              repository.replaceWeeklyDay({
                roomId,
                isoWeekday,
                intervals,
                expectedVersion: version,
              }),
            )
          }
          onReplaceWeeklyPair={(
            firstWeekday,
            firstIntervals,
            secondWeekday,
            secondIntervals,
            version,
          ) =>
            run(() =>
              repository.replaceWeeklyPair({
                roomId,
                firstWeekday,
                firstIntervals,
                secondWeekday,
                secondIntervals,
                expectedVersion: version,
              }),
            )
          }
          onReplaceOverride={(
            localDate: string,
            intervals: ScheduleInterval[],
            version: number,
          ) =>
            run(() =>
              repository.replaceDateOverride({
                roomId,
                localDate,
                intervals,
                expectedVersion: version,
              }),
            )
          }
          onReplaceOverridePair={(
            firstDate,
            firstIntervals,
            secondDate,
            secondIntervals,
            version,
          ) =>
            run(() =>
              repository.replaceDateOverridePair({
                roomId,
                firstDate,
                firstIntervals,
                secondDate,
                secondIntervals,
                expectedVersion: version,
              }),
            )
          }
          onRestoreOverride={(localDate: string, version: number) =>
            run(() =>
              repository.restoreDateOverride(roomId, localDate, version),
            )
          }
          onMigrateZone={(timeZone: string, version: number) =>
            run(() =>
              repository.migrateScheduleZone({
                roomId,
                timeZone,
                expectedVersion: version,
              }),
            )
          }
        />
      )}
      {view === "proposals" && (
        <ProposalPanel
          snapshot={snapshot}
          viewerTimeZone={viewerTimeZone}
          actions={proposalActions}
          onCreateProposal={() => setProposalDraft({})}
        />
      )}
      {proposalDraft && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onMouseDown={() => setProposalDraft(null)}
        >
          <section
            ref={proposalDialogRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-heading">
              <h2 id="proposal-title">{t("planGame")}</h2>
              <button
                className="icon-button"
                type="button"
                aria-label={t("close")}
                onClick={() => setProposalDraft(null)}
              >
                ×
              </button>
            </div>
            <ProposalForm
              mode="proposal"
              defaultWindow={proposalDraft.defaultWindow}
              viewerTimeZone={viewerTimeZone}
              onClose={() => setProposalDraft(null)}
              onSubmit={async (gameName, option) => {
                await run(() =>
                  repository.createProposal(roomId, gameName, option),
                );
              }}
            />
          </section>
        </div>
      )}
      {inviteOpen && <InviteSheet token={inviteToken} onClose={closeInvite} />}
    </Shell>
  );
}
