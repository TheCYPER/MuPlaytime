import { useState, type FormEvent } from "react";
import { normalizeNamePreview } from "../domain/name";
import type { RoomClaim } from "../data/schemas";
import { isInvalidInviteError, type RoomRepository } from "../data/repository";
import { useI18n } from "../i18n/I18nProvider";
import { LanguageSwitch } from "../ui/LanguageSwitch";
import { TimezoneSelect } from "../ui/TimezoneSelect";
import { detectTimeZone, readPreferences } from "../app/preferences";
import { roomHash } from "../app/router";

export function EntryFrame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="entry-page">
      <div className="entry-language">
        <LanguageSwitch />
      </div>
      <section className="entry-hero">
        <p className="eyebrow">{t("crossTimezoneCoop")}</p>
        <h1>
          MU<span>/</span>
          <wbr />
          PLAYTIME
        </h1>
        <p>{t("tagline")}</p>
        <div className="thread-sample" aria-hidden="true">
          <i className="status-free" />
          <i className="status-busy" />
          <i className="status-unknown" />
        </div>
      </section>
      {children}
    </main>
  );
}

export function ClaimForm({
  mode,
  onSubmit,
}: {
  mode: "create" | "join";
  onSubmit: (value: {
    displayName: string;
    roomName: string;
    timeZone: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("Game Night");
  const [timeZone, setTimeZone] = useState(detectTimeZone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setRetryable(false);
    try {
      normalizeNamePreview(displayName);
    } catch {
      setError(t("invalidName"));
      return;
    }
    setPending(true);
    try {
      await onSubmit({ displayName, roomName, timeZone });
    } catch (cause) {
      const invalidInvite = mode === "join" && isInvalidInviteError(cause);
      setError(invalidInvite ? t("invalidInvite") : t("serviceError"));
      setRetryable(!invalidInvite);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={(event) => void submit(event)}>
      <h2>{mode === "create" ? t("createRoom") : t("joinRoom")}</h2>
      {mode === "create" && (
        <label className="field">
          <span>{t("roomName")}</span>
          <input
            value={roomName}
            maxLength={80}
            required
            onChange={(event) => setRoomName(event.target.value)}
          />
        </label>
      )}
      <label className="field">
        <span>{t("displayName")}</span>
        <input
          value={displayName}
          maxLength={80}
          autoComplete="nickname"
          required
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <TimezoneSelect value={timeZone} onChange={setTimeZone} />
      <p className="trust-note">{t("weakIdentity")}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary"
        disabled={pending}
        type="submit"
      >
        {pending
          ? mode === "create"
            ? t("creating")
            : t("joining")
          : retryable
            ? t("retry")
            : mode === "create"
              ? t("create")
              : t("join")}
      </button>
    </form>
  );
}

export function LandingPage({
  repository,
  onClaim,
}: {
  repository: RoomRepository;
  onClaim: (claim: RoomClaim, inviteToken?: string) => void;
}) {
  const { t } = useI18n();
  const preferences = readPreferences();
  return (
    <EntryFrame>
      <ClaimForm
        mode="create"
        onSubmit={async ({ roomName, displayName, timeZone }) => {
          const claim = await repository.createRoom({
            roomName,
            displayName,
            initialTimeZone: timeZone,
          });
          onClaim(claim, claim.invite_token);
        }}
      />
      {preferences.lastRoomId && (
        <a
          className="resume-link"
          href={roomHash(
            preferences.lastRoomId,
            preferences.lastView ?? "group",
          )}
        >
          {t("resumeRoom")} →
        </a>
      )}
    </EntryFrame>
  );
}

export function JoinPage({
  repository,
  inviteToken,
  onClaim,
}: {
  repository: RoomRepository;
  inviteToken: string;
  onClaim: (claim: RoomClaim, inviteToken: string) => void;
}) {
  return (
    <EntryFrame>
      <ClaimForm
        mode="join"
        onSubmit={async ({ displayName, timeZone }) => {
          const claim = await repository.joinRoom({
            inviteToken,
            displayName,
            initialTimeZone: timeZone,
          });
          onClaim(claim, inviteToken);
        }}
      />
    </EntryFrame>
  );
}
