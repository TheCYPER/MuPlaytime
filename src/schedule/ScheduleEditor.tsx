import { Temporal } from "@js-temporal/polyfill";
import { useMemo, useState, type FormEvent } from "react";
import type {
  RoomSnapshot,
  ScheduleInterval,
  ScheduleState,
} from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import {
  canonicalizeIntervals,
  formatMinute,
  paintInterval,
} from "./intervals";
import { TimezoneSelect } from "../ui/TimezoneSelect";
import { resolveLocalIntervals } from "./timezone";
import { isScheduleVersionConflict } from "../data/repository";

function timeToMinute(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (hours === undefined || minutes === undefined)
    throw new Error("invalid_time");
  return hours * 60 + minutes;
}

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
  const label =
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
          .join(" · ");
  return {
    label,
    skipped: resolved.annotations.filter((item) => item.kind === "skipped")
      .length,
    repeated: resolved.annotations.filter((item) => item.kind === "repeated")
      .length,
  };
}

interface TimezonePreviewSourceRow {
  key: string;
  source: string;
  localDate: string;
  interval: ScheduleInterval | null;
}

interface PaintFormProps {
  intervals: readonly ScheduleInterval[];
  allowNextDay?: boolean;
  onPaint: (next: ScheduleInterval[]) => Promise<void>;
  onPaintNextDay: (
    currentDay: ScheduleInterval[],
    nextDayEndMinute: number,
    state: ScheduleState | "unknown",
  ) => Promise<void>;
}

function PaintForm({
  intervals,
  allowNextDay = true,
  onPaint,
  onPaintNextDay,
}: PaintFormProps) {
  const { t } = useI18n();
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [state, setState] = useState<ScheduleState | "unknown">("free");
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(operation: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await operation();
    } catch (cause) {
      setError(
        t(
          isScheduleVersionConflict(cause)
            ? "scheduleConflict"
            : "scheduleSaveFailed",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  function cellState(startMinute: number): ScheduleState | "unknown" {
    const matching = intervals.find(
      (interval) =>
        interval.startMinute <= startMinute &&
        interval.endMinute >= startMinute + 30,
    );
    return matching?.state ?? "unknown";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const startMinute = timeToMinute(start);
      const endMinute = timeToMinute(end);
      if (endsNextDay && allowNextDay) {
        if (endMinute > startMinute)
          throw new RangeError("cross_midnight_range_invalid");
        const currentDay = paintInterval(intervals, startMinute, 1440, state);
        await save(() =>
          endMinute === 0
            ? onPaint(currentDay)
            : onPaintNextDay(currentDay, endMinute, state),
        );
      } else {
        await save(() =>
          onPaint(paintInterval(intervals, startMinute, endMinute, state)),
        );
      }
    } catch {
      setError(t("invalidTime"));
    }
  }

  return (
    <form className="paint-form" onSubmit={(event) => void submit(event)}>
      <label>
        <span>{t("start")}</span>
        <input
          type="time"
          step={1800}
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <label>
        <span>{t("end")}</span>
        <input
          type="time"
          step={1800}
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </label>
      <label>
        <span>{t("state")}</span>
        <select
          value={state}
          onChange={(event) =>
            setState(event.target.value as ScheduleState | "unknown")
          }
        >
          <option value="free">{t("free")}</option>
          <option value="busy">{t("busy")}</option>
          <option value="unknown">{t("unknown")}</option>
        </select>
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={endsNextDay && allowNextDay}
          disabled={!allowNextDay}
          onChange={(event) => setEndsNextDay(event.target.checked)}
        />
        <span>{t("endsNextDay")}</span>
      </label>
      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? t("saving") : state === "unknown" ? t("erase") : t("paint")}
      </button>
      <fieldset className="day-paint-grid" disabled={pending}>
        <legend>{t("quickPaint")}</legend>
        {Array.from({ length: 48 }, (_, index) => {
          const startMinute = index * 30;
          const endMinute = startMinute + 30;
          const currentState = cellState(startMinute);
          return (
            <button
              aria-label={`${formatMinute(startMinute)}–${formatMinute(endMinute)}: ${t(currentState)}. ${t(state === "unknown" ? "erase" : "paint")}`}
              className={`day-paint-cell status-${currentState}`}
              key={startMinute}
              onClick={() =>
                void save(() =>
                  onPaint(
                    paintInterval(intervals, startMinute, endMinute, state),
                  ),
                )
              }
              title={`${formatMinute(startMinute)}–${formatMinute(endMinute)} · ${t(currentState)}`}
              type="button"
            >
              {index % 4 === 0 ? formatMinute(startMinute) : ""}
            </button>
          );
        })}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function IntervalList({
  intervals,
}: {
  intervals: readonly ScheduleInterval[];
}) {
  const { t } = useI18n();
  if (intervals.length === 0)
    return <p className="empty-note">{t("noIntervals")}</p>;
  return (
    <ul className="interval-list">
      {canonicalizeIntervals(intervals).map((interval) => (
        <li
          className={`status-${interval.state}`}
          key={`${interval.startMinute}-${interval.endMinute}-${interval.state}`}
        >
          <span className="mono">
            {formatMinute(interval.startMinute)}–
            {formatMinute(interval.endMinute)}
          </span>
          <strong>{t(interval.state)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function ScheduleEditor({
  snapshot,
  viewerTimeZone,
  onViewerTimeZone,
  onReplaceWeekly,
  onReplaceWeeklyPair,
  onReplaceOverride,
  onReplaceOverridePair,
  onRestoreOverride,
  onMigrateZone,
  onCreateProposal,
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  onViewerTimeZone: (zone: string) => void;
  onReplaceWeekly: (
    weekday: number,
    intervals: ScheduleInterval[],
    version: number,
  ) => Promise<void>;
  onReplaceWeeklyPair: (
    firstWeekday: number,
    first: ScheduleInterval[],
    secondWeekday: number,
    second: ScheduleInterval[],
    version: number,
  ) => Promise<void>;
  onReplaceOverride: (
    localDate: string,
    intervals: ScheduleInterval[],
    version: number,
  ) => Promise<void>;
  onReplaceOverridePair: (
    firstDate: string,
    first: ScheduleInterval[],
    secondDate: string,
    second: ScheduleInterval[],
    version: number,
  ) => Promise<void>;
  onRestoreOverride: (localDate: string, version: number) => Promise<void>;
  onMigrateZone: (zone: string, version: number) => Promise<void>;
  onCreateProposal: () => void;
}) {
  const { locale, t } = useI18n();
  const schedule = snapshot.schedules.find(
    (item) => item.memberId === snapshot.currentMemberId,
  );
  const [weekday, setWeekday] = useState(Temporal.Now.plainDateISO().dayOfWeek);
  const [overrideDate, setOverrideDate] = useState(
    Temporal.Now.plainDateISO().toString(),
  );
  const [targetZone, setTargetZone] = useState(
    schedule?.timeZone ?? viewerTimeZone,
  );
  const [zoneMode, setZoneMode] = useState<"keep" | "migrate">("keep");
  const [actionError, setActionError] = useState<string | null>(null);
  const weeklyIntervals = useMemo(
    () => schedule?.weekly.filter((item) => item.isoWeekday === weekday) ?? [],
    [schedule, weekday],
  );
  if (!schedule) return <p className="form-error">{t("serviceError")}</p>;

  async function runScheduleAction(operation: () => Promise<void>) {
    setActionError(null);
    try {
      await operation();
    } catch (cause) {
      setActionError(
        t(
          isScheduleVersionConflict(cause)
            ? "scheduleConflict"
            : "scheduleSaveFailed",
        ),
      );
    }
  }
  const override = schedule.overrides.find(
    (item) => item.localDate === overrideDate,
  );
  const overrideWeekday = Temporal.PlainDate.from(overrideDate).dayOfWeek;
  const resolvedOverride =
    override?.intervals ??
    schedule.weekly.filter((item) => item.isoWeekday === overrideWeekday);
  const timezonePreviewSources: TimezonePreviewSourceRow[] = [
    ...schedule.weekly.map((interval) => ({
      key: `weekly-${interval.isoWeekday}-${interval.startMinute}-${interval.endMinute}`,
      source: `${t("weeklyTemplate")} · ${weekdayLabel(interval.isoWeekday, locale)} ${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`,
      localDate: nextWeekday(interval.isoWeekday),
      interval,
    })),
    ...schedule.overrides.flatMap<TimezonePreviewSourceRow>((item) =>
      item.intervals.length === 0
        ? [
            {
              key: `override-${item.localDate}-empty`,
              source: `${t("dateOverride")} · ${item.localDate}`,
              localDate: item.localDate,
              interval: null,
            },
          ]
        : item.intervals.map((interval) => ({
            key: `override-${item.localDate}-${interval.startMinute}-${interval.endMinute}`,
            source: `${t("dateOverride")} · ${item.localDate} ${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`,
            localDate: item.localDate,
            interval,
          })),
    ),
  ];
  const timezonePreviewRows = timezonePreviewSources.map((row) => {
    if (!row.interval)
      return {
        ...row,
        before: { label: t("unknown"), skipped: 0, repeated: 0 },
        after: { label: t("unknown"), skipped: 0, repeated: 0 },
      };
    const before = resolvedLabel(
      row.localDate,
      row.interval,
      schedule.timeZone,
      zoneMode === "keep" ? viewerTimeZone : targetZone,
    );
    const after =
      zoneMode === "keep"
        ? resolvedLabel(
            row.localDate,
            row.interval,
            schedule.timeZone,
            targetZone,
          )
        : resolvedLabel(row.localDate, row.interval, targetZone, targetZone);
    return { ...row, before, after };
  });

  return (
    <section className="schedule-page" aria-labelledby="schedule-heading">
      <header className="view-heading">
        <div>
          <p className="eyebrow">
            {t("scheduleZone")}: {schedule.timeZone}
          </p>
          <h1 id="schedule-heading">{t("mySchedule")}</h1>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={onCreateProposal}
        >
          {t("planGame")}
        </button>
      </header>
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      <section className="editor-section">
        <div className="section-heading">
          <div>
            <span className="section-number">01</span>
            <h2>{t("weeklyTemplate")}</h2>
          </div>
          <label className="field-inline">
            <span>{t("weekday")}</span>
            <select
              value={weekday}
              onChange={(event) => setWeekday(Number(event.target.value))}
            >
              {Array.from({ length: 7 }, (_, index) => index + 1).map((day) => (
                <option value={day} key={day}>
                  {weekdayLabel(day, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <IntervalList intervals={weeklyIntervals} />
        <PaintForm
          intervals={weeklyIntervals}
          onPaint={(next) => onReplaceWeekly(weekday, next, schedule.version)}
          onPaintNextDay={(current, nextEnd, state) => {
            const nextWeekday = weekday === 7 ? 1 : weekday + 1;
            const existingNext = schedule.weekly.filter(
              (item) => item.isoWeekday === nextWeekday,
            );
            const next = paintInterval(existingNext, 0, nextEnd, state);
            return onReplaceWeeklyPair(
              weekday,
              current,
              nextWeekday,
              next,
              schedule.version,
            );
          }}
        />
      </section>

      <section className="editor-section">
        <div className="section-heading">
          <div>
            <span className="section-number">02</span>
            <h2>{t("dateOverride")}</h2>
          </div>
          <label className="field-inline">
            <span>{t("day")}</span>
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={overrideDate}
              onChange={(event) => {
                if (event.target.value) setOverrideDate(event.target.value);
              }}
            />
          </label>
        </div>
        <p className="section-note">
          {override ? t("dateOverride") : t("previewOnly")}
        </p>
        <IntervalList intervals={resolvedOverride} />
        <PaintForm
          intervals={resolvedOverride}
          allowNextDay={overrideDate < "9999-12-31"}
          onPaint={(next) =>
            onReplaceOverride(overrideDate, next, schedule.version)
          }
          onPaintNextDay={(current, nextEnd, state) => {
            const nextDate = Temporal.PlainDate.from(overrideDate).add({
              days: 1,
            });
            const nextDateString = nextDate.toString();
            const nextOverride = schedule.overrides.find(
              (item) => item.localDate === nextDateString,
            );
            const existingNext =
              nextOverride?.intervals ??
              schedule.weekly.filter(
                (item) => item.isoWeekday === nextDate.dayOfWeek,
              );
            const next = paintInterval(existingNext, 0, nextEnd, state);
            return onReplaceOverridePair(
              overrideDate,
              current,
              nextDateString,
              next,
              schedule.version,
            );
          }}
        />
        {override && (
          <button
            className="button button-secondary"
            type="button"
            onClick={() =>
              void runScheduleAction(() =>
                onRestoreOverride(overrideDate, schedule.version),
              )
            }
          >
            {t("restoreTemplate")}
          </button>
        )}
      </section>

      <section className="editor-section zone-section">
        <div className="section-heading">
          <div>
            <span className="section-number">03</span>
            <h2>{t("changeScheduleZone")}</h2>
          </div>
        </div>
        <TimezoneSelect value={targetZone} onChange={setTargetZone} />
        <p>{t("previewOnly")}</p>
        <label className="choice-row">
          <input
            type="radio"
            checked={zoneMode === "keep"}
            onChange={() => setZoneMode("keep")}
          />{" "}
          <span>
            {t("keepAnchor")}
            <small>
              {schedule.timeZone} → {targetZone} ({t("viewerZone")})
            </small>
          </span>
        </label>
        <label className="choice-row">
          <input
            type="radio"
            checked={zoneMode === "migrate"}
            onChange={() => setZoneMode("migrate")}
          />{" "}
          <span>
            {t("migrateSchedule")}
            <small>
              {schedule.timeZone} → {targetZone}
            </small>
          </span>
        </label>
        <div
          className="timezone-preview"
          aria-labelledby="timezone-preview-heading"
        >
          <h3 id="timezone-preview-heading">{t("timezonePreview")}</h3>
          <div className="preview-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("previewSource")}</th>
                  <th>{t("previewBefore")}</th>
                  <th>{t("previewAfter")}</th>
                  <th>{t("previewNotes")}</th>
                </tr>
              </thead>
              <tbody>
                {timezonePreviewRows.map((row) => (
                  <tr key={row.key}>
                    <th>{row.source}</th>
                    <td className="mono">{row.before.label}</td>
                    <td className="mono">{row.after.label}</td>
                    <td>
                      {row.before.skipped + row.after.skipped > 0 &&
                        `${row.before.skipped + row.after.skipped} ${t("dstSkipped")}`}{" "}
                      {row.before.repeated + row.after.repeated > 0 &&
                        `${row.before.repeated + row.after.repeated} ${t("dstRepeated")}`}{" "}
                      {row.before.skipped +
                        row.after.skipped +
                        row.before.repeated +
                        row.after.repeated ===
                        0 && t("noDstNotes")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() =>
            zoneMode === "keep"
              ? onViewerTimeZone(targetZone)
              : void runScheduleAction(() =>
                  onMigrateZone(targetZone, schedule.version),
                )
          }
        >
          {t("confirmMigration")}
        </button>
      </section>
    </section>
  );
}
