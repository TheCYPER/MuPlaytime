import type { ReactNode } from "react";
import type { RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { TimezoneSelect } from "../ui/TimezoneSelect";
import { roomHash } from "./router";

export function Shell({
  snapshot,
  view,
  viewerTimeZone,
  onViewerTimeZone,
  onInvite,
  children,
}: {
  snapshot: RoomSnapshot;
  view: "group" | "schedule" | "proposals";
  viewerTimeZone: string;
  onViewerTimeZone: (zone: string) => void;
  onInvite: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const current = snapshot.members.find(
    (member) => member.id === snapshot.currentMemberId,
  );
  const links = [
    {
      id: "group" as const,
      label: t("group"),
      hash: roomHash(snapshot.roomId, "group"),
    },
    {
      id: "schedule" as const,
      label: t("mySchedule"),
      hash: roomHash(snapshot.roomId, "schedule"),
    },
    {
      id: "proposals" as const,
      label: t("proposals"),
      hash: roomHash(snapshot.roomId, "proposals"),
    },
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#/" aria-label={t("appName")}>
          MU<span>/</span>PLAYTIME
        </a>
        <strong className="room-title">{snapshot.roomName}</strong>
        <div className="topbar-actions">
          <TimezoneSelect
            compact
            value={viewerTimeZone}
            onChange={onViewerTimeZone}
            label={t("viewerZone")}
          />
          <LanguageSwitch />
          <button
            className="button button-secondary"
            type="button"
            onClick={onInvite}
          >
            {t("invite")}
          </button>
          <span className="claimed-name">{current?.displayName}</span>
        </div>
      </header>
      <nav className="section-nav" aria-label={t("menu")}>
        {links.map((link) => (
          <a
            href={link.hash}
            key={link.id}
            className={view === link.id ? "active" : undefined}
            aria-current={view === link.id ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <main id="main-content">{children}</main>
      <nav className="mobile-nav" aria-label={t("menu")}>
        {links.map((link) => (
          <a
            href={link.hash}
            key={link.id}
            className={view === link.id ? "active" : undefined}
            aria-current={view === link.id ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
