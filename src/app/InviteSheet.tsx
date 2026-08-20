import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

export function inviteUrl(token: string): string {
  const base = new URL(
    import.meta.env.BASE_URL,
    window.location.origin,
  ).toString();
  return `${base}#/join/${encodeURIComponent(token)}`;
}

export function InviteSheet({ token }: { token: string | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const url = token ? inviteUrl(token) : null;
  return (
    <div className="invite-sheet-content">
      {url ? (
        <>
          <p>{t("inviteEphemeral")}</p>
          <textarea
            data-dialog-initial-focus
            readOnly
            value={url}
            rows={3}
            aria-label={t("copyInvite")}
          />
          <div className="sheet-action-stack">
            {typeof navigator.share === "function" && (
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setShareError(false);
                  void navigator
                    .share({ title: t("appName"), url })
                    .catch((cause: unknown) => {
                      if (
                        !(cause instanceof DOMException) ||
                        cause.name !== "AbortError"
                      )
                        setShareError(true);
                    });
                }}
              >
                {t("shareInvite")}
              </button>
            )}
            <button
              className="button button-secondary"
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
          </div>
          {shareError && (
            <p className="form-error" role="alert">
              {t("shareFailed")}
            </p>
          )}
        </>
      ) : (
        <p data-dialog-initial-focus tabIndex={-1}>
          {t("inviteUnavailable")}
        </p>
      )}
    </div>
  );
}
