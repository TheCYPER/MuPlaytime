import { useState } from "react";
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
import { ProposalForm } from "./ProposalForm";

interface ProposalActions {
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

function fire(action: () => Promise<void>): void {
  void action().catch(() => undefined);
}

function OptionCard({
  proposal,
  snapshot,
  viewerTimeZone,
  actions,
}: {
  proposal: Proposal;
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  actions: ProposalActions;
}) {
  const { t, formatDate } = useI18n();
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
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
                  disabled={!eligible}
                  type="button"
                  key={choice}
                  onClick={() => fire(() => actions.respond(option.id, choice))}
                >
                  <span>{t(choice)}</span>
                  <strong>{totals[choice]}</strong>
                </button>
              ))}
              {own && (
                <button
                  className="clear-response"
                  disabled={!eligible}
                  type="button"
                  onClick={() => fire(() => actions.respond(option.id, null))}
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
                        onClick={() =>
                          fire(() => actions.acknowledgeWatch(ownWatch.id))
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
                          disabled={!thresholdValid}
                          onClick={() =>
                            fire(() => actions.setWatch(option.id, threshold))
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
                      disabled={!thresholdValid}
                      onClick={() =>
                        fire(() => actions.setWatch(option.id, threshold))
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
                    onClick={() =>
                      fire(() => actions.confirm(proposal.id, option.id))
                    }
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
                    onClick={() =>
                      fire(() => actions.withdrawOption(option.id))
                    }
                  >
                    {t("withdrawOption")}
                  </button>
                )}
            </div>
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
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  actions: ProposalActions;
  onCreateProposal: () => void;
}) {
  const { t } = useI18n();
  const [addingTo, setAddingTo] = useState<ProposalId | null>(null);
  const [rename, setRename] = useState<Record<string, string>>({});
  return (
    <section className="proposals-page" aria-labelledby="proposals-heading">
      <header className="view-heading">
        <div>
          <p className="eyebrow">MULTI-OPTION RENDEZVOUS</p>
          <h1 id="proposals-heading">{t("proposals")}</h1>
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
      <div className="proposal-stack">
        {snapshot.proposals.map((proposal) => {
          const creator = snapshot.members.find(
            (member) => member.id === proposal.createdByMemberId,
          );
          const isCreator =
            proposal.createdByMemberId === snapshot.currentMemberId;
          return (
            <article
              className={`proposal-ticket proposal-${proposal.status}`}
              key={proposal.id}
            >
              <header className="proposal-heading">
                <div>
                  <span className="status-label">{t(proposal.status)}</span>
                  <h2>{proposal.gameName}</h2>
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
                      onClick={() =>
                        fire(() =>
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
                      onClick={() => fire(() => actions.cancel(proposal.id))}
                    >
                      {t("cancelProposal")}
                    </button>
                  </div>
                )}
                {isCreator && proposal.status === "scheduled" && (
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => fire(() => actions.cancel(proposal.id))}
                  >
                    {t("cancelProposal")}
                  </button>
                )}
              </header>
              <OptionCard
                proposal={proposal}
                snapshot={snapshot}
                viewerTimeZone={viewerTimeZone}
                actions={actions}
              />
              {proposal.status === "open" &&
                (addingTo === proposal.id ? (
                  <div className="nested-form">
                    <ProposalForm
                      mode="option"
                      viewerTimeZone={viewerTimeZone}
                      onSubmit={async (_game, option) => {
                        await actions.addOption(proposal.id, option);
                        setAddingTo(null);
                      }}
                    />
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setAddingTo(null)}
                    >
                      {t("close")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setAddingTo(proposal.id)}
                  >
                    {t("suggestTime")}
                  </button>
                ))}
              {proposal.status === "scheduled" && (
                <p className="section-note">{t("rescheduleHint")}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
