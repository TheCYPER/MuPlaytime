import type { ConcreteOptionInput } from "../data/repository";
import { Temporal } from "@js-temporal/polyfill";
import type { ProposalId, RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import type {
  ProposedWindow,
  SelectionDetailContext,
} from "../board/GroupBoard";
import { SelectionDetailSheet } from "../board/SelectionDetailSheet";
import {
  BoardTimeChoiceSheet,
  type BoardTimeChoiceContext,
} from "../board/BoardTimeChoiceSheet";
import { ProposalForm } from "../proposals/ProposalForm";
import { ProposalDetailSheet } from "../proposals/ProposalDetailSheet";
import type { ProposalActions } from "../proposals/ProposalPanel";
import {
  ScheduleIntervalSheet,
  type ScheduleIntervalContext,
} from "../schedule/ScheduleIntervalSheet";
import { ModalSheet } from "../ui/ModalSheet";
import { COMPACT_LAYOUT_QUERY } from "../ui/responsive";
import { useMediaQuery } from "../ui/useMediaQuery";
import {
  TimezoneChangeSheet,
  type TimezoneChangeContext,
} from "../schedule/TimezoneChangeSheet";
import { InviteSheet } from "./InviteSheet";
import { RoomActionsSheet } from "./RoomActionsSheet";
import { RoomStatusRegion } from "./RoomStatusRegion";

export type ProposalFormContext =
  | { mode: "proposal"; defaultWindow?: ProposedWindow }
  | { mode: "option"; proposalId: ProposalId };

export type TransientRoomSheet =
  | { kind: "room-actions" }
  | { kind: "invite" }
  | { kind: "selection-detail"; context: SelectionDetailContext }
  | { kind: "board-time-choice"; context: BoardTimeChoiceContext }
  | { kind: "proposal-form"; context: ProposalFormContext }
  | { kind: "schedule-interval"; context: ScheduleIntervalContext }
  | { kind: "timezone-change"; context: TimezoneChangeContext }
  | null;

export function RoomSheetHost({
  snapshot,
  viewerTimeZone,
  inviteToken,
  sheet,
  onViewerTimeZone,
  onClose,
  onReplace,
  onCreateProposal,
  onAddOption,
  online,
  checking,
  statusError,
  onRetryStatus,
  routeProposalId,
  proposalActions,
  onCloseProposal,
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  inviteToken: string | null;
  sheet: TransientRoomSheet;
  onViewerTimeZone: (zone: string) => void;
  onClose: () => void;
  onReplace: (sheet: Exclude<TransientRoomSheet, null>) => void;
  onCreateProposal: (
    gameName: string,
    option: ConcreteOptionInput,
  ) => Promise<void>;
  onAddOption: (
    proposalId: ProposalId,
    option: ConcreteOptionInput,
  ) => Promise<void>;
  online: boolean;
  checking: boolean;
  statusError: boolean;
  onRetryStatus: () => void;
  routeProposalId?: string;
  proposalActions: ProposalActions;
  onCloseProposal: () => void;
}) {
  const { t } = useI18n();
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const routeProposal = routeProposalId
    ? snapshot.proposals.find((proposal) => proposal.id === routeProposalId)
    : undefined;
  const routeDetailOpen = compact && Boolean(routeProposalId);
  if (!sheet && !routeDetailOpen) return null;

  const closeEffective = sheet ? onClose : onCloseProposal;

  let title = t("details");
  let size: "full" | "compact" = "full";
  let content;
  let footer;

  if (!sheet) {
    title = routeProposal?.gameName ?? t("proposalNotFound");
    content = routeProposal ? (
      <ProposalDetailSheet
        key={routeProposal.id}
        proposal={routeProposal}
        snapshot={snapshot}
        viewerTimeZone={viewerTimeZone}
        actions={proposalActions}
        online={online}
        onSuggestTime={() =>
          onReplace({
            kind: "proposal-form",
            context: { mode: "option", proposalId: routeProposal.id },
          })
        }
      />
    ) : (
      <div className="empty-state" data-dialog-initial-focus tabIndex={-1}>
        <p>{t("proposalNotFound")}</p>
        <button
          className="button button-primary"
          type="button"
          onClick={onCloseProposal}
        >
          {t("returnToList")}
        </button>
      </div>
    );
  } else
    switch (sheet.kind) {
      case "room-actions":
        title = t("more");
        size = "compact";
        content = (
          <RoomActionsSheet
            snapshot={snapshot}
            viewerTimeZone={viewerTimeZone}
            onViewerTimeZone={onViewerTimeZone}
            onInvite={() => onReplace({ kind: "invite" })}
          />
        );
        break;
      case "invite":
        title = t("invite");
        size = "compact";
        content = <InviteSheet token={inviteToken} />;
        break;
      case "selection-detail": {
        title = t("selectedWindow");
        const { range, viewerTimeZone: sourceTimeZone } = sheet.context;
        content = (
          <SelectionDetailSheet
            snapshot={snapshot}
            range={range}
            viewerTimeZone={sourceTimeZone}
          />
        );
        footer = (
          <button
            className="button button-primary sheet-primary-action"
            type="button"
            onClick={() =>
              onReplace({
                kind: "proposal-form",
                context: {
                  mode: "proposal",
                  defaultWindow: {
                    ...range,
                    sourceTimeZone,
                  },
                },
              })
            }
          >
            {t("proposeThisTime")}
          </button>
        );
        break;
      }
      case "board-time-choice":
        title =
          sheet.context.issue === "ambiguous"
            ? t("ambiguousTime")
            : t("nonexistentTime");
        size = "compact";
        content = (
          <BoardTimeChoiceSheet context={sheet.context} onClose={onClose} />
        );
        break;
      case "proposal-form":
        title =
          sheet.context.mode === "proposal" ? t("planGame") : t("suggestTime");
        content = (
          <ProposalForm
            key={
              sheet.context.mode === "proposal"
                ? `proposal-${sheet.context.defaultWindow?.startEpochMilliseconds ?? "blank"}`
                : `option-${sheet.context.proposalId}`
            }
            mode={sheet.context.mode}
            defaultWindow={
              sheet.context.mode === "proposal"
                ? sheet.context.defaultWindow
                : undefined
            }
            viewerTimeZone={viewerTimeZone}
            online={online}
            onClose={onClose}
            onSubmit={async (gameName, option) => {
              if (sheet.context.mode === "proposal")
                await onCreateProposal(gameName, option);
              else await onAddOption(sheet.context.proposalId, option);
            }}
          />
        );
        break;
      case "schedule-interval": {
        title = sheet.context.mode === "edit" ? t("editTime") : t("addTime");
        const currentSchedule = snapshot.schedules.find(
          (schedule) => schedule.memberId === snapshot.currentMemberId,
        );
        const scope = sheet.context.scope;
        let latestIntervals = [...sheet.context.intervals];
        let latestPreviousDayIntervals = [
          ...sheet.context.previousDayIntervals,
        ];
        let latestNextDayIntervals = [...sheet.context.nextDayIntervals];
        if (currentSchedule && scope.kind === "weekly") {
          latestIntervals = currentSchedule.weekly.filter(
            (interval) => interval.isoWeekday === scope.isoWeekday,
          );
          const followingWeekday =
            scope.isoWeekday === 7 ? 1 : scope.isoWeekday + 1;
          const previousWeekday =
            scope.isoWeekday === 1 ? 7 : scope.isoWeekday - 1;
          latestPreviousDayIntervals = currentSchedule.weekly.filter(
            (interval) => interval.isoWeekday === previousWeekday,
          );
          latestNextDayIntervals = currentSchedule.weekly.filter(
            (interval) => interval.isoWeekday === followingWeekday,
          );
        } else if (currentSchedule && scope.kind === "date") {
          latestIntervals =
            currentSchedule.overrides.find(
              (override) => override.localDate === scope.localDate,
            )?.intervals ??
            currentSchedule.weekly.filter(
              (interval) =>
                interval.isoWeekday ===
                Temporal.PlainDate.from(scope.localDate).dayOfWeek,
            );
          if (scope.localDate < "9999-12-31") {
            const followingDate = Temporal.PlainDate.from(scope.localDate).add({
              days: 1,
            });
            latestNextDayIntervals =
              currentSchedule.overrides.find(
                (override) => override.localDate === followingDate.toString(),
              )?.intervals ??
              currentSchedule.weekly.filter(
                (interval) => interval.isoWeekday === followingDate.dayOfWeek,
              );
          }
          if (scope.localDate > "0001-01-01") {
            const previousDate = Temporal.PlainDate.from(
              scope.localDate,
            ).subtract({ days: 1 });
            latestPreviousDayIntervals =
              currentSchedule.overrides.find(
                (override) => override.localDate === previousDate.toString(),
              )?.intervals ??
              currentSchedule.weekly.filter(
                (interval) => interval.isoWeekday === previousDate.dayOfWeek,
              );
          }
        }
        content = (
          <ScheduleIntervalSheet
            context={sheet.context}
            online={online}
            latestVersion={
              currentSchedule?.version ?? sheet.context.openedVersion
            }
            latestIntervals={latestIntervals}
            latestPreviousDayIntervals={latestPreviousDayIntervals}
            latestNextDayIntervals={latestNextDayIntervals}
            onClose={onClose}
          />
        );
        break;
      }
      case "timezone-change": {
        title = t("reviewTimezone");
        const currentSchedule = snapshot.schedules.find(
          (schedule) => schedule.memberId === snapshot.currentMemberId,
        );
        content = currentSchedule ? (
          <TimezoneChangeSheet
            schedule={currentSchedule}
            viewerTimeZone={viewerTimeZone}
            context={sheet.context}
            online={online}
            onClose={onClose}
          />
        ) : (
          <p className="form-error">{t("serviceError")}</p>
        );
        break;
      }
    }

  return (
    <ModalSheet
      title={title}
      size={size}
      footer={footer}
      onClose={closeEffective}
      fallbackFocusSelector="#main-content h1"
      focusKey={
        sheet
          ? `${sheet.kind}-${sheet.kind === "proposal-form" ? sheet.context.mode : ""}`
          : `proposal-${routeProposalId}`
      }
    >
      {(!online || checking || statusError) && (
        <RoomStatusRegion
          online={online}
          checking={checking}
          error={statusError}
          onRetry={onRetryStatus}
        />
      )}
      {content}
    </ModalSheet>
  );
}
