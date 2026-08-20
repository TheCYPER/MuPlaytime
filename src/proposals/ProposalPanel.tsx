import { Fragment, useRef, useState } from "react";
import type { ConcreteOptionInput } from "../data/repository";
import type {
  OptionId,
  Proposal,
  ProposalId,
  ResponseChoice,
  RoomSnapshot,
  WatchId,
} from "../domain/types";
import {
  currentResponse,
  isOptionResponseEligible,
  responseTotals,
  selectPresentedWatch,
  watchPresentation,
} from "../domain/proposals";
import { useI18n } from "../i18n/I18nProvider";
import { proposalHash, pushProposalHash } from "../app/router";
import { COMPACT_LAYOUT_QUERY } from "../ui/responsive";
import { useMediaQuery } from "../ui/useMediaQuery";

type ProposalGroup = "attention" | "scheduled" | "open" | "history";

function groupProposal(
  proposal: Proposal,
  snapshot: RoomSnapshot,
  now = Date.now(),
): ProposalGroup {
  const attention = proposal.watches.some(
    (watch) =>
      watch.memberId === snapshot.currentMemberId &&
      watch.triggeredAt !== null &&
      watch.acknowledgedAt === null,
  );
  if (attention) return "attention";
  if (proposal.status === "scheduled") {
    const confirmed = proposal.options.find(
      (option) => option.id === proposal.confirmedOptionId,
    );
    if (confirmed && Date.parse(confirmed.startsAt) >= now) return "scheduled";
  }
  if (proposal.status === "open") return "open";
  return "history";
}

export interface ProposalActions {
  addOption: (
    proposalId: ProposalId,
    option: ConcreteOptionInput,
  ) => Promise<void>;
  respond: (
    optionId: OptionId,
    response: ResponseChoice | null,
  ) => Promise<void>;
  confirm: (proposalId: ProposalId, optionId: OptionId) => Promise<void>;
  rename: (proposalId: ProposalId, gameName: string) => Promise<void>;
  cancel: (proposalId: ProposalId) => Promise<void>;
  withdrawOption: (optionId: OptionId) => Promise<void>;
  setWatch: (optionId: OptionId, threshold: number) => Promise<void>;
  acknowledgeWatch: (watchId: WatchId) => Promise<void>;
}

export function ProposalOptionList({
  proposal,
  snapshot,
  viewerTimeZone,
  actions,
  online = true,
}: {
  proposal: Proposal;
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  actions: ProposalActions;
  online?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [actionState, setActionState] = useState<
    Record<string, { pending: boolean; error: string | null }>
  >({});
  const pendingKeysRef = useRef(new Set<string>());
  async function perform(
    key: string,
    action: () => Promise<void>,
  ): Promise<boolean> {
    if (!online) {
      setActionState((current) => ({
        ...current,
        [key]: { pending: false, error: t("writesOffline") },
      }));
      return false;
    }
    if (pendingKeysRef.current.has(key)) return false;
    pendingKeysRef.current.add(key);
    setActionState((current) => ({
      ...current,
      [key]: { pending: true, error: null },
    }));
    try {
      await action();
      setActionState((current) => ({
        ...current,
        [key]: { pending: false, error: null },
      }));
      return true;
    } catch {
      setActionState((current) => ({
        ...current,
        [key]: { pending: false, error: t("actionFailed") },
      }));
      return false;
    } finally {
      pendingKeysRef.current.delete(key);
    }
  }
  return (
    <div className="option-list">
      {proposal.options.map((option, index) => {
        const totals = responseTotals(proposal.responses, option.id);
        const own = currentResponse(
          proposal.responses,
          option.id,
          snapshot.currentMemberId,
        );
        const eligible = isOptionResponseEligible(proposal, option);
        const suggester = snapshot.members.find(
          (member) => member.id === option.suggestedByMemberId,
        );
        const ownWatch = selectPresentedWatch(
          proposal.watches,
          option.id,
          snapshot.currentMemberId,
        );
        const historicalExpired = proposal.watches.filter(
          (watch) =>
            watch.optionId === option.id &&
            watch.memberId === snapshot.currentMemberId &&
            watch.triggeredAt === null &&
            watch.closedAt !== null &&
            watch.id !== ownWatch?.id,
        );
        const watchState = ownWatch ? watchPresentation(ownWatch) : null;
        const threshold = thresholds[option.id] ?? ownWatch?.threshold ?? 2;
        const setThreshold = (next: number) =>
          setThresholds((current) => ({
            ...current,
            [option.id]: next,
          }));
        const thresholdValid = Number.isInteger(threshold) && threshold > 0;
        const closeReason =
          ownWatch?.closeReason === "option_withdrawn"
            ? t("watchOptionWithdrawn")
            : ownWatch?.closeReason === "not_selected"
              ? t("watchNotSelected")
              : ownWatch?.closeReason === "proposal_cancelled"
                ? t("watchProposalCancelled")
                : "";
        const isFinal = proposal.confirmedOptionId === option.id;
        const responseKey = `respond:${option.id}`;
        const watchKey = `watch:${option.id}`;
        const optionError = Object.entries(actionState).find(
          ([key, value]) => key.endsWith(`:${option.id}`) && value.error,
        )?.[1].error;
        return (
          <article
            className={`option-card${isFinal ? " final" : ""}${option.withdrawnAt ? " withdrawn" : ""}`}
            key={option.id}
          >
            <header>
              <span className="option-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>
                  {formatDate(new Date(option.startsAt), {
                    timeZone: viewerTimeZone,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
                <small>
                  {option.durationMinutes} {t("minutes")} ·{" "}
                  {option.sourceTimeZone} {option.sourceOffset} ·{" "}
                  {suggester?.displayName}
                </small>
              </div>
              <span className="accept-count">
                {totals.accept} {t("accepted")}
              </span>
            </header>
            <div
              className="response-bar"
              aria-label={`${totals.accept} ${t("accept")}, ${totals.maybe} ${t("maybe")}, ${totals.decline} ${t("decline")}`}
            >
              {(["accept", "maybe", "decline"] as const).map((choice) => (
                <button
                  className={own === choice ? "selected" : undefined}
                  disabled={
                    !online || !eligible || actionState[responseKey]?.pending
                  }
                  type="button"
                  key={choice}
                  onClick={() =>
                    void perform(responseKey, () =>
                      actions.respond(option.id, choice),
                    )
                  }
                >
                  <span>{t(choice)}</span>
                  <strong>{totals[choice]}</strong>
                </button>
              ))}
              {own && (
                <button
                  className="clear-response"
                  disabled={
                    !online || !eligible || actionState[responseKey]?.pending
                  }
                  type="button"
                  onClick={() =>
                    void perform(responseKey, () =>
                      actions.respond(option.id, null),
                    )
                  }
                >
                  {t("withdrawResponse")}
                </button>
              )}
            </div>
            {(eligible || ownWatch) && (
              <div className="watch-row">
                {ownWatch ? (
                  <>
                    <span>
                      {watchState === "triggered"
                        ? t("reminderTriggered")
                        : watchState === "expired"
                          ? `${t("reminderExpired")} ${closeReason}`
                          : t("reminderWatching")}{" "}
                      · X={ownWatch.threshold}
                    </span>
                    {watchState === "triggered" && (
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={!online}
                        onClick={() =>
                          void perform(`acknowledge:${option.id}`, () =>
                            actions.acknowledgeWatch(ownWatch.id),
                          )
                        }
                      >
                        {t("acknowledge")}
                      </button>
                    )}
                    {watchState === "watching" && eligible && (
                      <>
                        <input
                          aria-label={t("threshold")}
                          type="number"
                          min={1}
                          value={threshold}
                          onChange={(event) =>
                            setThreshold(Number(event.target.value))
                          }
                        />
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={
                            !online ||
                            !thresholdValid ||
                            actionState[watchKey]?.pending
                          }
                          onClick={() =>
                            void perform(watchKey, () =>
                              actions.setWatch(option.id, threshold),
                            )
                          }
                        >
                          {t("setReminder")}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <label>
                      <span>{t("remindAt")}</span>
                      <input
                        type="number"
                        min={1}
                        value={threshold}
                        onChange={(event) =>
                          setThreshold(Number(event.target.value))
                        }
                      />
                    </label>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={
                        !online ||
                        !thresholdValid ||
                        actionState[watchKey]?.pending
                      }
                      onClick={() =>
                        void perform(watchKey, () =>
                          actions.setWatch(option.id, threshold),
                        )
                      }
                    >
                      {t("setReminder")}
                    </button>
                  </>
                )}
                {eligible &&
                  thresholdValid &&
                  threshold > snapshot.members.length && (
                    <small>{t("thresholdAboveRoom")}</small>
                  )}
              </div>
            )}
            {historicalExpired.length > 0 && (
              <ul className="watch-history">
                {historicalExpired.map((watch) => (
                  <li key={watch.id}>
                    {t("previousWatch")} · X={watch.threshold} ·{" "}
                    {watch.closeReason === "option_withdrawn"
                      ? t("watchOptionWithdrawn")
                      : watch.closeReason === "not_selected"
                        ? t("watchNotSelected")
                        : t("watchProposalCancelled")}
                  </li>
                ))}
              </ul>
            )}
            <div className="option-actions">
              {proposal.status === "open" &&
                proposal.createdByMemberId === snapshot.currentMemberId &&
                !option.withdrawnAt && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={!online}
                    onClick={() => setConfirmation(`confirm:${option.id}`)}
                  >
                    {t("confirmTime")}
                  </button>
                )}
              {proposal.status === "open" &&
                option.suggestedByMemberId === snapshot.currentMemberId &&
                !option.withdrawnAt && (
                  <button
                    className="text-button danger"
                    type="button"
                    disabled={!online}
                    onClick={() =>
                      setConfirmation(`withdraw-option:${option.id}`)
                    }
                  >
                    {t("withdrawOption")}
                  </button>
                )}
            </div>
            {(confirmation === `confirm:${option.id}` ||
              confirmation === `withdraw-option:${option.id}`) && (
              <div className="inline-action-confirmation" role="alert">
                <p>
                  {t(
                    confirmation.startsWith("confirm:")
                      ? "confirmFinalWarning"
                      : "withdrawOptionWarning",
                  )}
                </p>
                <div>
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={
                      !online ||
                      actionState[
                        `${confirmation.startsWith("confirm:") ? "confirm" : "withdraw-option"}:${option.id}`
                      ]?.pending
                    }
                    onClick={() => {
                      const key = confirmation;
                      const operation = confirmation.startsWith("confirm:")
                        ? () => actions.confirm(proposal.id, option.id)
                        : () => actions.withdrawOption(option.id);
                      void perform(key, operation).then((saved) => {
                        if (saved) setConfirmation(null);
                      });
                    }}
                  >
                    {t("confirmAction")}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setConfirmation(null)}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}
            {optionError && (
              <p className="form-error" role="alert">
                {optionError}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function ProposalPanel({
  snapshot,
  viewerTimeZone,
  actions,
  onCreateProposal,
  onSuggestTime,
  selectedProposalId,
  online = true,
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  actions: ProposalActions;
  onCreateProposal: () => void;
  onSuggestTime: (proposalId: ProposalId) => void;
  selectedProposalId?: string;
  online?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const [rename, setRename] = useState<Record<string, string>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [actionState, setActionState] = useState<
    Record<string, { pending: boolean; error: string | null }>
  >({});
  async function perform(
    key: string,
    action: () => Promise<void>,
  ): Promise<boolean> {
    if (!online) {
      setActionState((current) => ({
        ...current,
        [key]: { pending: false, error: t("writesOffline") },
      }));
      return false;
    }
    setActionState((current) => ({
      ...current,
      [key]: { pending: true, error: null },
    }));
    try {
      await action();
      setActionState((current) => ({
        ...current,
        [key]: { pending: false, error: null },
      }));
      return true;
    } catch {
      setActionState((current) => ({
        ...current,
        [key]: { pending: false, error: t("actionFailed") },
      }));
      return false;
    }
  }
  const groupOrder: ProposalGroup[] = [
    "attention",
    "scheduled",
    "open",
    "history",
  ];
  const presentedProposals = compact
    ? groupOrder.flatMap((group) =>
        snapshot.proposals.filter(
          (proposal) => groupProposal(proposal, snapshot) === group,
        ),
      )
    : snapshot.proposals;
  const historyCount = snapshot.proposals.filter(
    (proposal) => groupProposal(proposal, snapshot) === "history",
  ).length;
  const activeCount = snapshot.proposals.length - historyCount;
  const selectedProposalIsHistory = snapshot.proposals.some(
    (proposal) =>
      proposal.id === selectedProposalId &&
      groupProposal(proposal, snapshot) === "history",
  );
  const effectiveHistoryExpanded =
    historyExpanded || (compact && selectedProposalIsHistory);
  return (
    <section className="proposals-page" aria-labelledby="proposals-heading">
      <header className="view-heading">
        <div>
          <p className="eyebrow">{t("advisory")}</p>
          <h1 id="proposals-heading" tabIndex={-1}>
            {t("proposals")}
          </h1>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={onCreateProposal}
        >
          {t("planGame")}
        </button>
      </header>
      {snapshot.proposals.length === 0 && (
        <p className="empty-state">{t("noProposals")}</p>
      )}
      {compact && activeCount === 0 && historyCount > 0 && (
        <p className="empty-state">{t("noActiveProposals")}</p>
      )}
      <div className="proposal-stack">
        {presentedProposals.map((proposal, proposalIndex) => {
          const creator = snapshot.members.find(
            (member) => member.id === proposal.createdByMemberId,
          );
          const isCreator =
            proposal.createdByMemberId === snapshot.currentMemberId;
          const group = groupProposal(proposal, snapshot);
          const previousGroup =
            proposalIndex > 0 && presentedProposals[proposalIndex - 1]
              ? groupProposal(presentedProposals[proposalIndex - 1]!, snapshot)
              : null;
          const responded = proposal.options.filter(
            (option) =>
              currentResponse(
                proposal.responses,
                option.id,
                snapshot.currentMemberId,
              ) !== null,
          ).length;
          const watching = proposal.watches.filter(
            (watch) =>
              watch.memberId === snapshot.currentMemberId &&
              watch.closedAt === null &&
              watch.acknowledgedAt === null,
          ).length;
          const confirmedOption = proposal.options.find(
            (option) => option.id === proposal.confirmedOptionId,
          );
          const accepted = confirmedOption
            ? responseTotals(proposal.responses, confirmedOption.id).accept
            : proposal.options.reduce(
                (maximum, option) =>
                  Math.max(
                    maximum,
                    responseTotals(proposal.responses, option.id).accept,
                  ),
                0,
              );
          return (
            <Fragment key={proposal.id}>
              {compact && previousGroup !== group && group !== "history" && (
                <h2 className="proposal-group-heading">{t(group)}</h2>
              )}
              {compact && previousGroup !== group && group === "history" && (
                <div className="proposal-history-disclosure">
                  <button
                    className="button button-secondary"
                    type="button"
                    aria-expanded={effectiveHistoryExpanded}
                    onClick={() => setHistoryExpanded((expanded) => !expanded)}
                  >
                    <span>
                      {t(
                        effectiveHistoryExpanded
                          ? "hideHistory"
                          : "showHistory",
                      )}
                    </span>
                    <span className="mono">{historyCount}</span>
                  </button>
                </div>
              )}
              <article
                id={`proposal-${proposal.id}`}
                className={`proposal-ticket proposal-${proposal.status}${selectedProposalId === proposal.id ? " route-selected" : ""}`}
                hidden={
                  compact && group === "history" && !effectiveHistoryExpanded
                }
              >
                <a
                  className="proposal-mobile-summary"
                  href={proposalHash(snapshot.roomId, proposal.id)}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    pushProposalHash(snapshot.roomId, proposal.id);
                  }}
                >
                  <span className="status-label">{t(proposal.status)}</span>
                  <strong>{proposal.gameName}</strong>
                  <small>
                    {confirmedOption
                      ? formatDate(new Date(confirmedOption.startsAt), {
                          timeZone: viewerTimeZone,
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : `${proposal.options.length} ${t("options")}`}{" "}
                    · {accepted} {t("accepted")}
                  </small>
                  <small>
                    {t("respondedProgress")
                      .replace("{done}", String(responded))
                      .replace("{total}", String(proposal.options.length))}
                    {watching > 0 && ` · ${watching} ${t("remindersWatching")}`}
                  </small>
                  <small>{creator?.displayName}</small>
                </a>
                <header className="proposal-heading">
                  <div>
                    <span className="status-label">{t(proposal.status)}</span>
                    <h2>
                      <a
                        href={proposalHash(snapshot.roomId, proposal.id)}
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          pushProposalHash(snapshot.roomId, proposal.id);
                        }}
                      >
                        {proposal.gameName}
                      </a>
                    </h2>
                    <small>{creator?.displayName}</small>
                  </div>
                  {isCreator && proposal.status === "open" && (
                    <div className="proposal-admin">
                      <input
                        aria-label={t("gameName")}
                        value={rename[proposal.id] ?? proposal.gameName}
                        onChange={(event) =>
                          setRename((current) => ({
                            ...current,
                            [proposal.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className="text-button"
                        type="button"
                        disabled={!online}
                        onClick={() =>
                          void perform(`rename:${proposal.id}`, () =>
                            actions.rename(
                              proposal.id,
                              rename[proposal.id] ?? proposal.gameName,
                            ),
                          )
                        }
                      >
                        {t("rename")}
                      </button>
                      <button
                        className="text-button danger"
                        type="button"
                        disabled={!online}
                        onClick={() => setConfirmCancelId(proposal.id)}
                      >
                        {t("cancelProposal")}
                      </button>
                    </div>
                  )}
                  {isCreator && proposal.status === "scheduled" && (
                    <button
                      className="text-button danger"
                      type="button"
                      disabled={!online}
                      onClick={() => setConfirmCancelId(proposal.id)}
                    >
                      {t("cancelProposal")}
                    </button>
                  )}
                </header>
                {confirmCancelId === proposal.id && (
                  <div className="inline-action-confirmation" role="alert">
                    <p>{t("cancelProposalWarning")}</p>
                    <div>
                      <button
                        className="button button-danger"
                        type="button"
                        disabled={
                          !online ||
                          actionState[`cancel:${proposal.id}`]?.pending
                        }
                        onClick={() =>
                          void perform(`cancel:${proposal.id}`, () =>
                            actions.cancel(proposal.id),
                          ).then((saved) => {
                            if (saved) setConfirmCancelId(null);
                          })
                        }
                      >
                        {t("confirmAction")}
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                )}
                <ProposalOptionList
                  proposal={proposal}
                  snapshot={snapshot}
                  viewerTimeZone={viewerTimeZone}
                  actions={actions}
                  online={online}
                />
                {actionState[`rename:${proposal.id}`]?.error ||
                actionState[`cancel:${proposal.id}`]?.error ? (
                  <p className="form-error" role="alert">
                    {t("actionFailed")}
                  </p>
                ) : null}
                {proposal.status === "open" && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => onSuggestTime(proposal.id)}
                  >
                    {t("suggestTime")}
                  </button>
                )}
                {proposal.status === "scheduled" && (
                  <p className="section-note">{t("rescheduleHint")}</p>
                )}
              </article>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
