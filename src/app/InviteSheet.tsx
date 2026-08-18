import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { useDialogFocus } from "../ui/useDialogFocus";

export function inviteUrl(token: string): string {
  const base = new URL(
    import.meta.env.BASE_URL,
    window.location.origin,
  ).toString();
  return `${base}#/join/${encodeURIComponent(token)}`;
}

export function InviteSheet({
  token,
  onClose,
}: {
  token: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = token ? inviteUrl(token) : null;
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose);
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-heading">
          <h2 id="invite-title">{t("invite")}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
        <p>{t("inviteEphemeral")}</p>
        {url ? (
          <>
            <textarea
              data-dialog-initial-focus
              readOnly
              value={url}
              rows={3}
              aria-label={t("copyInvite")}
            />
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? t("inviteCopied") : t("copyInvite")}
            </button>
          </>
        ) : (
          <p className="form-error">{t("inviteEphemeral")}</p>
        )}
      </section>
    </div>
  );
}
