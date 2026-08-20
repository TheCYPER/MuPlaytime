import { useEffect, useRef, type ReactNode } from "react";
import type { RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { TimezoneSelect } from "../ui/TimezoneSelect";
import { roomHash } from "./router";
import { MobileRoomHeader } from "./MobileRoomHeader";

export function Shell({
  snapshot,
  view,
  viewerTimeZone,
  onViewerTimeZone,
  onInvite,
  onMore,
  children,
}: {
  snapshot: RoomSnapshot;
  view: "group" | "schedule" | "proposals";
  viewerTimeZone: string;
  onViewerTimeZone: (zone: string) => void;
  onInvite: () => void;
  onMore: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const mobileNavRef = useRef<HTMLElement>(null);
  const previousViewRef = useRef(view);
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
  useEffect(() => {
    const nav = mobileNavRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    let lastHeight = -1;
    const update = () => {
      const safeAreaPadding = Number.parseFloat(
        getComputedStyle(nav).paddingBottom,
      );
      const nextHeight = Math.ceil(
        nav.getBoundingClientRect().height -
          (Number.isFinite(safeAreaPadding) ? safeAreaPadding : 0),
      );
      if (nextHeight === lastHeight) return;
      lastHeight = nextHeight;
      document.documentElement.style.setProperty(
        "--mobile-nav-block-size",
        `${nextHeight}px`,
      );
    };
    const observer = new ResizeObserver(() => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    });
    observer.observe(nav);
    update();
    return () => {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty("--mobile-nav-block-size");
    };
  }, []);
  useEffect(() => {
    if (previousViewRef.current === view) return;
    previousViewRef.current = view;
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("#main-content h1");
      heading?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [view]);
  return (
    <div className="app-shell">
      <MobileRoomHeader snapshot={snapshot} onMore={onMore} />
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
          <span className="claimed-name" title={current?.displayName}>
            {current?.displayName}
          </span>
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
      <nav ref={mobileNavRef} className="mobile-nav" aria-label={t("menu")}>
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
