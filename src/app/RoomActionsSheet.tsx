import type { RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { TimezoneSelect } from "../ui/TimezoneSelect";

export function RoomActionsSheet({
  snapshot,
  viewerTimeZone,
  onViewerTimeZone,
  onInvite,
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  onViewerTimeZone: (zone: string) => void;
  onInvite: () => void;
}) {
  const { t } = useI18n();
  const current = snapshot.members.find(
    (member) => member.id === snapshot.currentMemberId,
  );
  return (
    <div className="room-actions-sheet">
      <section
        className="room-identity-block"
        data-dialog-initial-focus
        tabIndex={-1}
      >
        <span>{t("currentRoom")}</span>
        <strong>{snapshot.roomName}</strong>
        <p>
          {t("youAre")} <b>{current?.displayName ?? "—"}</b>
        </p>
      </section>
      <section className="room-action-section">
        <TimezoneSelect
          value={viewerTimeZone}
          onChange={onViewerTimeZone}
          label={t("viewerZone")}
        />
        <p className="section-note">{t("viewOnlyZone")}</p>
      </section>
      <section className="room-action-section">
        <LanguageSwitch />
      </section>
      <button
        className="button button-primary"
        type="button"
        onClick={onInvite}
      >
        {t("invite")}
      </button>
    </div>
  );
}
