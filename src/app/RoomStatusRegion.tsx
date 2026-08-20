import { useI18n } from "../i18n/I18nProvider";

export function RoomStatusRegion({
  online,
  checking,
  error = false,
  onRetry,
}: {
  online: boolean;
  checking: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  if (!online)
    return (
      <div className="room-status-region" role="status">
        {t("offline")}
      </div>
    );
  if (error)
    return (
      <div className="room-status-region error" role="alert">
        <span>{t("serviceError")}</span>
        {onRetry && (
          <button
            className="button button-secondary"
            type="button"
            onClick={onRetry}
          >
            {t("retry")}
          </button>
        )}
      </div>
    );
  const message = checking ? t("checkingSharedData") : "";
  if (!message) return null;
  return (
    <div className="room-status-region" role="status">
      {message}
    </div>
  );
}
