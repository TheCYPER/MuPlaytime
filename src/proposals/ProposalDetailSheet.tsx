import { useState } from "react";
import type { Proposal, RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { ProposalOptionList, type ProposalActions } from "./ProposalPanel";

export function ProposalDetailSheet({
  proposal,
  snapshot,
  viewerTimeZone,
  actions,
  onSuggestTime,
  online,
}: {
  proposal: Proposal;
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  actions: ProposalActions;
  onSuggestTime: () => void;
  online: boolean;
}) {
  const { t } = useI18n();
  const creator = snapshot.members.find(
    (member) => member.id === proposal.createdByMemberId,
  );
  const isCreator = proposal.createdByMemberId === snapshot.currentMemberId;
  const [showActions, setShowActions] = useState(false);
  const [rename, setRename] = useState(proposal.gameName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch {
      setError(t("actionFailed"));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="proposal-detail-sheet">
      <div
        className="proposal-detail-heading"
        data-dialog-initial-focus
        tabIndex={-1}
      >
        <span className="status-label">{t(proposal.status)}</span>
        <h3>{proposal.gameName}</h3>
        <p>{creator?.displayName ?? "—"}</p>
      </div>
      <ProposalOptionList
        proposal={proposal}
        snapshot={snapshot}
        viewerTimeZone={viewerTimeZone}
        actions={actions}
        online={online}
      />
      {proposal.status === "open" && (
        <button
          className="button button-secondary"
          type="button"
          onClick={onSuggestTime}
        >
          {t("suggestTime")}
        </button>
      )}
      {isCreator && (
        <div className="proposal-secondary-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => setShowActions((current) => !current)}
          >
            {t("proposalActions")}
          </button>
          {showActions && (
            <div className="proposal-action-mode">
              {proposal.status === "open" && (
                <>
                  <label className="field">
                    <span>{t("gameName")}</span>
                    <input
                      value={rename}
                      maxLength={120}
                      onChange={(event) => setRename(event.target.value)}
                    />
                  </label>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={pending || !online || !rename.trim()}
                    onClick={() =>
                      void run(() => actions.rename(proposal.id, rename))
                    }
                  >
                    {t("rename")}
                  </button>
                </>
              )}
              {proposal.status !== "cancelled" && (
                <>
                  {!confirmingCancel ? (
                    <button
                      className="button button-danger"
                      type="button"
                      disabled={pending || !online}
                      onClick={() => setConfirmingCancel(true)}
                    >
                      {t("cancelProposal")}
                    </button>
                  ) : (
                    <div className="inline-action-confirmation" role="alert">
                      <p>{t("cancelProposalWarning")}</p>
                      <div>
                        <button
                          className="button button-danger"
                          type="button"
                          disabled={pending || !online}
                          onClick={() =>
                            void run(() => actions.cancel(proposal.id)).then(
                              (saved) => {
                                if (saved) setConfirmingCancel(false);
                              },
                            )
                          }
                        >
                          {t("confirmAction")}
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirmingCancel(false)}
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {proposal.status === "scheduled" && (
        <p className="section-note">{t("rescheduleHint")}</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
