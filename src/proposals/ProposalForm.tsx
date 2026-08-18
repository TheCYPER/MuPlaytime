import { Temporal } from "@js-temporal/polyfill";
import { useMemo, useState, type FormEvent } from "react";
import type { ConcreteOptionInput } from "../data/repository";
import { useI18n } from "../i18n/I18nProvider";
import { localProposalChoices } from "../schedule/timezone";
import { TimezoneSelect } from "../ui/TimezoneSelect";
import type { ProposedWindow } from "../board/GroupBoard";

function initialLocal(
  defaultWindow: ProposedWindow | undefined,
  zone: string,
): string {
  const instant =
    defaultWindow?.startEpochMilliseconds ?? Date.now() + 60 * 60_000;
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function nearbyTimes(local: string, zone: string): string[] {
  try {
    const plain = Temporal.PlainDateTime.from(local);
    return [-60, -30, 30, 60]
      .map((minutes) =>
        plain.add({ minutes }).toString({ smallestUnit: "minute" }),
      )
      .filter((candidate) => localProposalChoices(candidate, zone).length > 0);
  } catch {
    return [];
  }
}

export function ProposalForm({
  mode,
  defaultWindow,
  viewerTimeZone,
  onSubmit,
  onClose,
}: {
  mode: "proposal" | "option";
  defaultWindow?: ProposedWindow;
  viewerTimeZone: string;
  onSubmit: (gameName: string, option: ConcreteOptionInput) => Promise<void>;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const initialZone = defaultWindow?.sourceTimeZone ?? viewerTimeZone;
  const [gameName, setGameName] = useState("");
  const [sourceTimeZone, setSourceTimeZone] = useState(initialZone);
  const [localStart, setLocalStart] = useState(() =>
    initialLocal(defaultWindow, initialZone),
  );
  const [duration, setDuration] = useState(() =>
    defaultWindow
      ? Math.max(
          30,
          Math.round(
            (defaultWindow.endEpochMilliseconds -
              defaultWindow.startEpochMilliseconds) /
              60_000,
          ),
        )
      : 120,
  );
  const [selectedInstant, setSelectedInstant] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(() => {
    try {
      return localProposalChoices(localStart, sourceTimeZone);
    } catch {
      return [];
    }
  }, [localStart, sourceTimeZone]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const chosen =
      choices.length === 1
        ? choices[0]
        : choices.find((choice) => choice.instant === selectedInstant);
    if (!chosen) {
      setError(
        choices.length === 0 ? t("nonexistentTime") : t("ambiguousTime"),
      );
      return;
    }
    setPending(true);
    try {
      await onSubmit(gameName, {
        startsAt: chosen.instant,
        durationMinutes: duration,
        sourceTimeZone,
        sourceLocalStart: localStart,
        sourceOffset: chosen.offset,
      });
      onClose?.();
    } catch {
      setError(t("serviceError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="proposal-form" onSubmit={(event) => void submit(event)}>
      {mode === "proposal" && (
        <label className="field">
          <span>{t("gameName")}</span>
          <input
            data-dialog-initial-focus
            required
            maxLength={120}
            value={gameName}
            onChange={(event) => setGameName(event.target.value)}
          />
        </label>
      )}
      <label className="field">
        <span>{t("start")}</span>
        <input
          required
          type="datetime-local"
          min="0001-01-01T00:00"
          max="9999-12-31T23:59"
          value={localStart}
          onChange={(event) => {
            setLocalStart(event.target.value);
            setSelectedInstant("");
          }}
        />
      </label>
      <TimezoneSelect
        value={sourceTimeZone}
        onChange={(zone) => {
          setSourceTimeZone(zone);
          setSelectedInstant("");
        }}
      />
      <label className="field">
        <span>{t("duration")}</span>
        <select
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        >
          {[30, 60, 90, 120, 180, 240, 360].map((minutes) => (
            <option value={minutes} key={minutes}>
              {minutes} {t("minutes")}
            </option>
          ))}
        </select>
      </label>
      {choices.length > 1 && (
        <fieldset className="offset-choices">
          <legend>{t("ambiguousTime")}</legend>
          {choices.map((choice) => (
            <label key={choice.instant}>
              <input
                required
                type="radio"
                name="offset-choice"
                value={choice.instant}
                checked={selectedInstant === choice.instant}
                onChange={() => setSelectedInstant(choice.instant)}
              />{" "}
              {t("offsetChoice")}: {choice.offset}
            </label>
          ))}
        </fieldset>
      )}
      {choices.length === 0 && (
        <div className="gap-warning" role="alert">
          <p>{t("nonexistentTime")}</p>
          <div>
            {nearbyTimes(localStart, sourceTimeZone).map((candidate) => (
              <button
                className="text-button"
                type="button"
                key={candidate}
                onClick={() => setLocalStart(candidate)}
              >
                {candidate.replace("T", " ")}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending
          ? t("saving")
          : mode === "proposal"
            ? t("submitProposal")
            : t("suggestTime")}
      </button>
    </form>
  );
}
