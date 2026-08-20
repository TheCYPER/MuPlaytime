import { Temporal } from "@js-temporal/polyfill";
import { useMemo, useState } from "react";
import { isScheduleVersionConflict } from "../data/repository";
import type { ScheduleInterval, ScheduleSet } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { TimezoneSelect } from "../ui/TimezoneSelect";
import { formatMinute } from "./intervals";
import { resolveLocalIntervals } from "./timezone";

function weekdayLabel(day: number, locale: string): string {
  const date = new Date(Date.UTC(2026, 7, 16 + day));
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

function nextWeekday(day: number): string {
  const today = Temporal.Now.plainDateISO();
  const delta = (day - today.dayOfWeek + 7) % 7;
  return today.add({ days: delta }).toString();
}

function resolvedLabel(
  localDate: string,
  interval: ScheduleInterval,
  anchorZone: string,
  displayZone: string,
): { label: string; skipped: number; repeated: number } {
  const resolved = resolveLocalIntervals(localDate, [interval], anchorZone);
  return {
    label:
      resolved.intervals.length === 0
        ? "∅"
        : resolved.intervals
            .map((item) => {
              const start = Temporal.Instant.fromEpochMilliseconds(
                item.startEpochMilliseconds,
              ).toZonedDateTimeISO(displayZone);
              const end = Temporal.Instant.fromEpochMilliseconds(
                item.endEpochMilliseconds,
              ).toZonedDateTimeISO(displayZone);
              return `${start.toPlainDateTime().toString({ smallestUnit: "minute" })} ${start.offset} → ${end.toPlainDateTime().toString({ smallestUnit: "minute" })} ${end.offset}`;
            })
            .join(" · "),
    skipped: resolved.annotations.filter((item) => item.kind === "skipped")
      .length,
    repeated: resolved.annotations.filter((item) => item.kind === "repeated")
      .length,
  };
}

export interface TimezoneChangeContext {
  onViewerTimeZone: (zone: string) => void;
  onMigrateZone: (zone: string, expectedVersion: number) => Promise<void>;
}

export function TimezoneChangeSheet({
  schedule,
  viewerTimeZone,
  context,
  online,
  onClose,
}: {
  schedule: ScheduleSet;
  viewerTimeZone: string;
  context: TimezoneChangeContext;
  online: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const [targetZone, setTargetZone] = useState(schedule.timeZone);
  const [mode, setMode] = useState<"keep" | "migrate">("keep");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedVersion] = useState(schedule.version);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const awaitingRefreshedSchedule =
    conflictVersion !== null && schedule.version === conflictVersion;
  const conflictNeedsReview =
    conflictVersion !== null && reviewedVersion !== schedule.version;
  const rows = useMemo(
    () =>
      [
        ...schedule.weekly.map((interval) => ({
          key: `weekly-${interval.isoWeekday}-${interval.startMinute}-${interval.endMinute}`,
          source: `${t("weeklyTemplate")} · ${weekdayLabel(interval.isoWeekday, locale)} ${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`,
          localDate: nextWeekday(interval.isoWeekday),
          interval,
        })),
        ...schedule.overrides.flatMap((override) =>
          override.intervals.map((interval) => ({
            key: `override-${override.localDate}-${interval.startMinute}-${interval.endMinute}`,
            source: `${t("dateOverride")} · ${override.localDate} ${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`,
            localDate: override.localDate,
            interval,
          })),
        ),
      ].map((row) => ({
        ...row,
        before: resolvedLabel(
          row.localDate,
          row.interval,
          schedule.timeZone,
          mode === "keep" ? viewerTimeZone : targetZone,
        ),
        after:
          mode === "keep"
            ? resolvedLabel(
                row.localDate,
                row.interval,
                schedule.timeZone,
                targetZone,
              )
            : resolvedLabel(
                row.localDate,
                row.interval,
                targetZone,
                targetZone,
              ),
      })),
    [locale, mode, schedule, t, targetZone, viewerTimeZone],
  );

  async function confirm() {
    if (mode === "keep") {
      context.onViewerTimeZone(targetZone);
      onClose();
      return;
    }
    if (!online) {
      setError(t("writesOffline"));
      return;
    }
    if (conflictNeedsReview) {
      setError(t("scheduleConflict"));
      return;
    }
    const expectedVersion =
      conflictVersion === null ? openedVersion : schedule.version;
    setPending(true);
    setError(null);
    try {
      await context.onMigrateZone(targetZone, expectedVersion);
      onClose();
    } catch (cause) {
      if (isScheduleVersionConflict(cause)) {
        setConflictVersion(expectedVersion);
        setReviewedVersion(null);
        setError(t("scheduleConflict"));
      } else {
        setError(t("scheduleSaveFailed"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="timezone-change-sheet">
      <p data-dialog-initial-focus tabIndex={-1}>
        {t("scheduleZone")}: <b>{schedule.timeZone}</b>
      </p>
      <TimezoneSelect
        value={targetZone}
        onChange={(zone) => {
          setTargetZone(zone);
          if (conflictVersion !== null) setReviewedVersion(null);
        }}
      />
      <label className="choice-row">
        <input
          type="radio"
          checked={mode === "keep"}
          onChange={() => {
            setMode("keep");
            if (conflictVersion !== null) setReviewedVersion(null);
          }}
        />
        <span>
          {t("keepAnchor")}
          <small>{t("viewOnlyZone")}</small>
        </span>
      </label>
      <label className="choice-row">
        <input
          type="radio"
          checked={mode === "migrate"}
          onChange={() => {
            setMode("migrate");
            if (conflictVersion !== null) setReviewedVersion(null);
          }}
        />
        <span>{t("migrateSchedule")}</span>
      </label>
      <div className="timezone-preview-cards">
        {rows.map((row) => (
          <article key={row.key}>
            <strong>{row.source}</strong>
            <dl>
              <div>
                <dt>{t("previewBefore")}</dt>
                <dd className="mono">{row.before.label}</dd>
              </div>
              <div>
                <dt>{t("previewAfter")}</dt>
                <dd className="mono">{row.after.label}</dd>
              </div>
              <div>
                <dt>{t("previewNotes")}</dt>
                <dd>
                  {row.before.skipped + row.after.skipped > 0 &&
                    `${row.before.skipped + row.after.skipped} ${t("dstSkipped")} `}
                  {row.before.repeated + row.after.repeated > 0 &&
                    `${row.before.repeated + row.after.repeated} ${t("dstRepeated")}`}
                  {row.before.skipped +
                    row.after.skipped +
                    row.before.repeated +
                    row.after.repeated ===
                    0 && t("noDstNotes")}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {mode === "migrate" && conflictNeedsReview && (
        <button
          className="button button-secondary"
          type="button"
          disabled={pending || awaitingRefreshedSchedule}
          onClick={() => {
            setReviewedVersion(schedule.version);
            setError(null);
          }}
        >
          {t("reviewAndRetry")}
        </button>
      )}
      <button
        className="button button-primary"
        type="button"
        disabled={
          pending || (mode === "migrate" && (!online || conflictNeedsReview))
        }
        onClick={() => void confirm()}
      >
        {pending
          ? t("saving")
          : t(mode === "keep" ? "applyViewerZone" : "confirmMigration")}
      </button>
    </div>
  );
}
