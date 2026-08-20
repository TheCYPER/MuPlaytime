import type { RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";

export function MobileRoomHeader({
  snapshot,
  onMore,
}: {
  snapshot: RoomSnapshot;
  onMore: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="mobile-room-header">
      <a className="mobile-wordmark" href="#/" aria-label={t("appName")}>
        MU<span>/</span>PT
      </a>
      <strong className="mobile-room-name" title={snapshot.roomName}>
        {snapshot.roomName}
      </strong>
      <button
        className="mobile-more-button"
        type="button"
        aria-label={t("more")}
        onClick={onMore}
      >
        <span aria-hidden="true">•••</span>
      </button>
    </header>
  );
}
