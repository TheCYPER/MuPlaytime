import { useCallback, useEffect, useRef, useState } from "react";
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
import { GroupBoard } from "../board/GroupBoard";
import { ProposalPanel } from "../proposals/ProposalPanel";
import { subscribeToRoomChanges } from "../realtime/roomRealtime";
import { ScheduleEditor } from "../schedule/ScheduleEditor";
import { LiveStatus } from "../ui/LiveStatus";
import { useVisualViewport } from "../ui/useVisualViewport";
import { RoomSheetHost, type TransientRoomSheet } from "./RoomSheetHost";
import { RoomStatusRegion } from "./RoomStatusRegion";
import { Shell } from "./Shell";
import { writePreferences } from "./preferences";
import { proposalWasOpenedFromList, replaceHash, roomHash } from "./router";
import {
  executeRoomMutation,
  ROOM_MUTATION_NETWORK_MODE,
} from "./roomMutation";

export function RoomPage({
  roomId,
  view,
  proposalId,
  repository,
  supabase,
  viewerTimeZone,
  onViewerTimeZone,
  inviteToken,
}: {
  roomId: RoomId;
  view: "group" | "schedule" | "proposals";
  proposalId?: string;
  repository: RoomRepository;
  supabase: SupabaseClient;
  viewerTimeZone: string;
  onViewerTimeZone: (zone: string) => void;
  inviteToken: string | null;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [transientSheet, setTransientSheet] =
    useState<TransientRoomSheet>(null);
  const openedInviteTokenRef = useRef<string | null>(null);
  const closedProposalRef = useRef<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useVisualViewport();
  const query = useQuery({
    queryKey: roomKeys.snapshot(roomId),
    queryFn: () => repository.snapshot(roomId),
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: executeRoomMutation,
    networkMode: ROOM_MUTATION_NETWORK_MODE,
    onSettled: () => invalidateRoom(queryClient, roomId),
  });
  useEffect(
    () => subscribeToRoomChanges(supabase, queryClient, roomId),
    [supabase, queryClient, roomId],
  );
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
    };
    const onOffline = () => {
      setOnline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  useEffect(() => {
    if (
      inviteToken &&
      openedInviteTokenRef.current !== inviteToken &&
      transientSheet === null
    ) {
      openedInviteTokenRef.current = inviteToken;
      setTransientSheet({ kind: "invite" });
    }
  }, [inviteToken, transientSheet]);
  useEffect(() => {
    if (proposalId || !closedProposalRef.current) return;
    const closedId = closedProposalRef.current;
    closedProposalRef.current = null;
    requestAnimationFrame(() => {
      const summary = document
        .getElementById(`proposal-${closedId}`)
        ?.querySelector("a");
      const target =
        summary && !summary.closest("[hidden]")
          ? summary
          : document.getElementById("proposals-heading");
      if (target instanceof HTMLElement) target.focus();
    });
  }, [proposalId]);
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

  const mutateAsync = mutation.mutateAsync;
  const run = useCallback(
    async (operation: () => Promise<unknown>) => {
      await mutateAsync({
        operation,
        onlineAtSubmit: navigator.onLine,
      });
    },
    [mutateAsync],
  );

  if (query.isPending)
    return (
      <main className="state-page">
        <div className="loader" />
        <p>{t("loading")}</p>
      </main>
    );
  if (!query.data)
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
      onInvite={() => setTransientSheet({ kind: "invite" })}
      onMore={() => setTransientSheet({ kind: "room-actions" })}
    >
      <RoomStatusRegion
        online={online}
        checking={online && query.isFetching && !query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
      />
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
          onPropose={(defaultWindow) =>
            setTransientSheet({
              kind: "proposal-form",
              context: { mode: "proposal", defaultWindow },
            })
          }
          onViewDetails={(context) =>
            setTransientSheet({ kind: "selection-detail", context })
          }
          onChooseDayTime={(context) =>
            setTransientSheet({ kind: "board-time-choice", context })
          }
        />
      )}
      {view === "schedule" && (
        <ScheduleEditor
          snapshot={snapshot}
          viewerTimeZone={viewerTimeZone}
          onViewerTimeZone={onViewerTimeZone}
          onCreateProposal={() =>
            setTransientSheet({
              kind: "proposal-form",
              context: { mode: "proposal" },
            })
          }
          onOpenInterval={(context) =>
            setTransientSheet({ kind: "schedule-interval", context })
          }
          onOpenTimezone={(context) =>
            setTransientSheet({ kind: "timezone-change", context })
          }
          online={online}
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
          selectedProposalId={proposalId}
          onCreateProposal={() =>
            setTransientSheet({
              kind: "proposal-form",
              context: { mode: "proposal" },
            })
          }
          onSuggestTime={(targetProposalId) =>
            setTransientSheet({
              kind: "proposal-form",
              context: { mode: "option", proposalId: targetProposalId },
            })
          }
          online={online}
        />
      )}
      <RoomSheetHost
        snapshot={snapshot}
        viewerTimeZone={viewerTimeZone}
        inviteToken={inviteToken}
        sheet={transientSheet}
        onViewerTimeZone={onViewerTimeZone}
        onClose={() => setTransientSheet(null)}
        onReplace={setTransientSheet}
        onCreateProposal={(gameName, option) =>
          run(() => repository.createProposal(roomId, gameName, option))
        }
        onAddOption={(targetProposalId, option) =>
          run(() => repository.addOption(roomId, targetProposalId, option))
        }
        online={online}
        checking={online && query.isFetching && !query.isPending}
        statusError={query.isError}
        onRetryStatus={() => void query.refetch()}
        routeProposalId={proposalId}
        proposalActions={proposalActions}
        onCloseProposal={() => {
          if (!proposalId) return;
          closedProposalRef.current = proposalId;
          if (proposalWasOpenedFromList(roomId, proposalId))
            window.history.back();
          else replaceHash(roomHash(roomId, "proposals"));
        }}
      />
    </Shell>
  );
}
