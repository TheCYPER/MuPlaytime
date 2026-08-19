import { useEffect, useMemo, useState } from "react";
import type { RoomId } from "../domain/types";
import { RoomRepository } from "../data/repository";
import {
  ensureAnonymousSession,
  getSupabase,
  loadPublicConfig,
} from "../data/supabase";
import type { RoomClaim } from "../data/schemas";
import { useI18n } from "../i18n/I18nProvider";
import { LandingPage, JoinPage } from "../rooms/EntryPages";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { RoomPage } from "./RoomPage";
import {
  detectTimeZone,
  readPreferences,
  writePreferences,
} from "./preferences";
import { parseHash, replaceHash, roomHash, type AppRoute } from "./router";

export function App() {
  const { t } = useI18n();
  const config = useMemo(() => loadPublicConfig(), []);
  const [route, setRoute] = useState<AppRoute>(parseHash);
  const [status, setStatus] = useState<
    "booting" | "ready" | "error" | "schema"
  >("booting");
  const [ephemeralInvite, setEphemeralInvite] = useState<{
    roomId: string;
    token: string;
  } | null>(null);
  const [viewerTimeZone, setViewerTimeZoneState] = useState(
    () => readPreferences().viewerTimeZone ?? detectTimeZone(),
  );
  const supabase = useMemo(
    () => (config ? getSupabase(config) : null),
    [config],
  );
  const repository = useMemo(
    () => (supabase ? new RoomRepository(supabase) : null),
    [supabase],
  );

  useEffect(() => {
    const listener = () => {
      const nextRoute = parseHash();
      setRoute(nextRoute);
      setEphemeralInvite((current) => {
        if (
          !current ||
          (nextRoute.kind === "room" && nextRoute.roomId === current.roomId)
        ) {
          return current;
        }
        return null;
      });
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!supabase || !repository || !config) return;
    let active = true;
    void ensureAnonymousSession(supabase)
      .then(() => repository.schemaMeta())
      .then((meta) => {
        if (!active) return;
        setStatus(
          meta.schema_version === config.schemaVersion &&
            meta.normalization_version === config.normalizationVersion
            ? "ready"
            : "schema",
        );
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [supabase, repository, config]);

  function setViewerTimeZone(zone: string) {
    writePreferences({ viewerTimeZone: zone });
    setViewerTimeZoneState(zone);
  }

  function onClaim(claim: RoomClaim, inviteToken?: string) {
    if (inviteToken)
      setEphemeralInvite({ roomId: claim.room_id, token: inviteToken });
    writePreferences({
      lastRoomId: claim.room_id,
      lastMemberId: claim.member_id,
      viewerTimeZone,
    });
    replaceHash(roomHash(claim.room_id));
  }

  if (!config || !supabase || !repository) {
    return (
      <main className="state-page config-state">
        <LanguageSwitch />
        <p className="eyebrow">PUBLIC CONFIG ONLY</p>
        <h1>{t("configTitle")}</h1>
        <p>{t("configBody")}</p>
        <code>
          VITE_SUPABASE_URL
          <br />
          VITE_SUPABASE_PUBLISHABLE_KEY
        </code>
      </main>
    );
  }
  if (status === "booting")
    return (
      <main className="state-page">
        <div className="loader" />
        <p>{t("loading")}</p>
      </main>
    );
  if (status === "schema")
    return (
      <main className="state-page">
        <h1>{t("schemaMismatch")}</h1>
        <p>{t("configBody")}</p>
      </main>
    );
  if (status === "error")
    return (
      <main className="state-page">
        <h1>{t("serviceError")}</h1>
        <button
          className="button button-primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          {t("retry")}
        </button>
      </main>
    );
  if (route.kind === "join")
    return (
      <JoinPage
        repository={repository}
        inviteToken={route.inviteToken}
        onClaim={onClaim}
      />
    );
  if (route.kind === "room")
    return (
      <RoomPage
        roomId={route.roomId as RoomId}
        view={route.view}
        repository={repository}
        supabase={supabase}
        viewerTimeZone={viewerTimeZone}
        onViewerTimeZone={setViewerTimeZone}
        inviteToken={
          ephemeralInvite?.roomId === route.roomId
            ? ephemeralInvite.token
            : null
        }
      />
    );
  return <LandingPage repository={repository} onClaim={onClaim} />;
}
