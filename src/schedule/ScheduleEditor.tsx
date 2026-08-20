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
import { COMPACT_LAYOUT_QUERY } from "../ui/responsive";
import { useMediaQuery } from "../ui/useMediaQuery";
import type { ScheduleIntervalContext } from "./ScheduleIntervalSheet";
import { compileScheduleWritePlan } from "./compileScheduleWritePlan";
import type { TimezoneChangeContext } from "./TimezoneChangeSheet";

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
  nextDayIntervals?: readonly ScheduleInterval[];
  version: number;
  allowNextDay?: boolean;
  onPaint: (next: ScheduleInterval[], expectedVersion: number) => Promise<void>;
  onPaintNextDay: (
    currentDay: ScheduleInterval[],
    nextDay: ScheduleInterval[],
    expectedVersion: number,
  ) => Promise<void>;
  online?: boolean;
}

function PaintForm({
  intervals,
  nextDayIntervals = [],
  version,
  allowNextDay = true,
  onPaint,
  onPaintNextDay,
  online = true,
}: PaintFormProps) {
  const { t } = useI18n();
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [state, setState] = useState<ScheduleState | "unknown">("free");
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeDraft, setRangeDraft] = useState(() => ({
    baseVersion: version,
    baseIntervals: canonicalizeIntervals(intervals),
    baseNextDayIntervals: canonicalizeIntervals(nextDayIntervals),
    dirty: false,
  }));
  const [rangeReviewedVersion, setRangeReviewedVersion] = useState<
    number | null
  >(null);
  const [quickDraft, setQuickDraft] = useState<{
    baseVersion: number;
    operations: {
      startMinute: number;
      endMinute: number;
      state: ScheduleState | "unknown";
    }[];
  }>({ baseVersion: version, operations: [] });
  const operations = quickDraft.operations;
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [paintBlock, setPaintBlock] = useState(4);
  const draftIntervals = useMemo(
    () =>
      operations.reduce(
        (current, operation) =>
          paintInterval(
            current,
            operation.startMinute,
            operation.endMinute,
            operation.state,
          ),
        canonicalizeIntervals(intervals),
      ),
    [intervals, operations],
  );
  const draftDirty = operations.length > 0;
  const baseChanged = draftDirty && version !== quickDraft.baseVersion;
  const rebaseNeedsReview = baseChanged && reviewedVersion !== version;
  const rangeBaseChanged =
    rangeDraft.dirty && version !== rangeDraft.baseVersion;
  const rangeRebaseNeedsReview =
    rangeBaseChanged && rangeReviewedVersion !== version;

  function markRangeDirty() {
    setRangeDraft((current) =>
      current.dirty
        ? current
        : {
            baseVersion: version,
            baseIntervals: canonicalizeIntervals(intervals),
            baseNextDayIntervals: canonicalizeIntervals(nextDayIntervals),
            dirty: true,
          },
    );
    setRangeReviewedVersion(null);
  }

  function intervalSummary(value: readonly ScheduleInterval[]): string {
    if (value.length === 0) return t("unknown");
    return canonicalizeIntervals(value)
      .map(
        (interval) =>
          `${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)} ${t(interval.state)}`,
      )
      .join(" · ");
  }

  async function save(operation: () => Promise<void>): Promise<boolean> {
    setError(null);
    if (!online) {
      setError(t("writesOffline"));
      return false;
    }
    setPending(true);
    try {
      await operation();
      return true;
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
    return false;
  }

  function cellState(startMinute: number): ScheduleState | "unknown" {
    const matching = draftIntervals.find(
      (interval) =>
        interval.startMinute <= startMinute &&
        interval.endMinute >= startMinute + 30,
    );
    return matching?.state ?? "unknown";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (rangeRebaseNeedsReview) {
      setError(t("scheduleConflict"));
      return;
    }
    try {
      const startMinute = timeToMinute(start);
      const endMinute = timeToMinute(end);
      const expectedVersion = rangeBaseChanged
        ? version
        : rangeDraft.dirty
          ? rangeDraft.baseVersion
          : version;
      const currentBase = rangeBaseChanged
        ? intervals
        : rangeDraft.dirty
          ? rangeDraft.baseIntervals
          : intervals;
      const followingBase = rangeBaseChanged
        ? nextDayIntervals
        : rangeDraft.dirty
          ? rangeDraft.baseNextDayIntervals
          : nextDayIntervals;
      let saved = false;
      if (endsNextDay && allowNextDay) {
        if (endMinute > startMinute)
          throw new RangeError("cross_midnight_range_invalid");
        const currentDay = paintInterval(currentBase, startMinute, 1440, state);
        const nextDay =
          endMinute === 0
            ? canonicalizeIntervals(followingBase)
            : paintInterval(followingBase, 0, endMinute, state);
        saved = await save(() =>
          endMinute === 0
            ? onPaint(currentDay, expectedVersion)
            : onPaintNextDay(currentDay, nextDay, expectedVersion),
        );
      } else {
        saved = await save(() =>
          onPaint(
            paintInterval(currentBase, startMinute, endMinute, state),
            expectedVersion,
          ),
        );
      }
      if (saved) {
        setRangeDraft({
          baseVersion: version,
          baseIntervals: canonicalizeIntervals(intervals),
          baseNextDayIntervals: canonicalizeIntervals(nextDayIntervals),
          dirty: false,
        });
        setRangeReviewedVersion(null);
      }
    } catch {
      setError(t("invalidTime"));
    }
  }

  const rangeRebasedPreview = (() => {
    if (!rangeBaseChanged) return null;
    try {
      const startMinute = timeToMinute(start);
      const endMinute = timeToMinute(end);
      if (endsNextDay) {
        const intendedCurrent = paintInterval(
          intervals,
          startMinute,
          1440,
          state,
        );
        const intendedNext =
          endMinute === 0
            ? canonicalizeIntervals(nextDayIntervals)
            : paintInterval(nextDayIntervals, 0, endMinute, state);
        return {
          current: `${intervalSummary(intervals)} → ${intervalSummary(nextDayIntervals)}`,
          intended: `${intervalSummary(intendedCurrent)} → ${intervalSummary(intendedNext)}`,
        };
      }
      return {
        current: intervalSummary(intervals),
        intended: intervalSummary(
          paintInterval(intervals, startMinute, endMinute, state),
        ),
      };
    } catch {
      return null;
    }
  })();

  return (
    <form className="paint-form" onSubmit={(event) => void submit(event)}>
      <label>
        <span>{t("start")}</span>
        <input
          type="time"
          step={1800}
          value={start}
          onChange={(event) => {
            markRangeDirty();
            setStart(event.target.value);
          }}
        />
      </label>
      <label>
        <span>{t("end")}</span>
        <input
          type="time"
          step={1800}
          value={end}
          onChange={(event) => {
            markRangeDirty();
            setEnd(event.target.value);
          }}
        />
      </label>
      <label>
        <span>{t("state")}</span>
        <select
          value={state}
          onChange={(event) => {
            markRangeDirty();
            setState(event.target.value as ScheduleState | "unknown");
          }}
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
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setEndsNextDay(checked);
            markRangeDirty();
          }}
        />
        <span>{t("endsNextDay")}</span>
      </label>
      {rangeRebasedPreview && (
        <div className="quick-paint-rebase" role="status">
          <p>{t("rangeDraftBaseChanged")}</p>
          <dl>
            <div>
              <dt>{t("currentSchedule")}</dt>
              <dd className="mono">{rangeRebasedPreview.current}</dd>
            </div>
            <div>
              <dt>{t("previewAfter")}</dt>
              <dd className="mono">{rangeRebasedPreview.intended}</dd>
            </div>
          </dl>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setRangeReviewedVersion(version)}
          >
            {t("reviewRebasedDraft")}
          </button>
        </div>
      )}
      <button
        className="button button-primary"
        type="submit"
        disabled={pending || !online || rangeRebaseNeedsReview}
      >
        {pending ? t("saving") : state === "unknown" ? t("erase") : t("paint")}
      </button>
      <fieldset className="quick-paint" disabled={pending}>
        <legend>{t("quickPaint")}</legend>
        <div className="quick-paint-navigation">
          <button
            className="icon-button"
            type="button"
            aria-label={t("previousBlock")}
            disabled={paintBlock === 0}
            onClick={() => setPaintBlock((current) => Math.max(0, current - 1))}
          >
            ←
          </button>
          <strong className="mono">
            {formatMinute(paintBlock * 240)}–
            {formatMinute((paintBlock + 1) * 240)}
          </strong>
          <button
            className="icon-button"
            type="button"
            aria-label={t("nextBlock")}
            disabled={paintBlock === 5}
            onClick={() => setPaintBlock((current) => Math.min(5, current + 1))}
          >
            →
          </button>
        </div>
        <div className="day-paint-grid">
          {Array.from({ length: 8 }, (_, index) => {
            const startMinute = paintBlock * 240 + index * 30;
            const endMinute = startMinute + 30;
            const currentState = cellState(startMinute);
            return (
              <button
                aria-label={`${formatMinute(startMinute)}–${formatMinute(endMinute)}: ${t(currentState)}. ${t(state === "unknown" ? "erase" : "paint")}`}
                className={`day-paint-cell status-${currentState}`}
                key={startMinute}
                onClick={() => {
                  setQuickDraft((current) => ({
                    baseVersion:
                      current.operations.length === 0
                        ? version
                        : current.baseVersion,
                    operations: [
                      ...current.operations,
                      { startMinute, endMinute, state },
                    ],
                  }));
                  setReviewedVersion(null);
                }}
                title={`${formatMinute(startMinute)}–${formatMinute(endMinute)} · ${t(currentState)}`}
                type="button"
              >
                <span>{formatMinute(startMinute)}</span>
                <small>{t(currentState)}</small>
              </button>
            );
          })}
        </div>
        {baseChanged && (
          <div className="quick-paint-rebase" role="status">
            <p>{t("quickPaintBaseChanged")}</p>
            <dl>
              <div>
                <dt>{t("currentSchedule")}</dt>
                <dd className="mono">{intervalSummary(intervals)}</dd>
              </div>
              <div>
                <dt>{t("previewAfter")}</dt>
                <dd className="mono">{intervalSummary(draftIntervals)}</dd>
              </div>
            </dl>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setReviewedVersion(version)}
            >
              {t("reviewRebasedDraft")}
            </button>
          </div>
        )}
        <div className="quick-paint-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={!draftDirty || pending || !online || rebaseNeedsReview}
            onClick={() => {
              void save(() =>
                onPaint(
                  draftIntervals,
                  baseChanged ? version : quickDraft.baseVersion,
                ),
              ).then((saved) => {
                if (saved)
                  setQuickDraft({ baseVersion: version, operations: [] });
              });
            }}
          >
            {pending ? t("saving") : t("saveChanges")}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!draftDirty || pending}
            onClick={() => {
              setQuickDraft({ baseVersion: version, operations: [] });
            }}
          >
            {t("cancel")}
          </button>
        </div>
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
  onEdit,
}: {
  intervals: readonly ScheduleInterval[];
  onEdit: (interval: ScheduleInterval) => void;
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
          <button
            className="button button-secondary interval-edit-button"
            type="button"
            onClick={() => onEdit(interval)}
          >
            {t("edit")}
          </button>
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
  onOpenInterval,
  onOpenTimezone,
  online = true,
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
  onOpenInterval: (context: ScheduleIntervalContext) => void;
  onOpenTimezone: (context: TimezoneChangeContext) => void;
  online?: boolean;
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
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const [activeSection, setActiveSection] = useState<
    "weekly" | "override" | "timezone"
  >("weekly");
  const [restoreReview, setRestoreReview] = useState<{
    localDate: string;
    openedVersion: number;
  } | null>(null);
  const weeklyIntervals = useMemo(
    () => schedule?.weekly.filter((item) => item.isoWeekday === weekday) ?? [],
    [schedule, weekday],
  );
  if (!schedule) return <p className="form-error">{t("serviceError")}</p>;
  const scheduleVersion = schedule.version;
  const weeklySchedule = schedule.weekly;
  const scheduleOverrides = schedule.overrides;

  async function runScheduleAction(
    operation: () => Promise<void>,
  ): Promise<boolean> {
    setActionError(null);
    if (!online) {
      setActionError(t("writesOffline"));
      return false;
    }
    try {
      await operation();
      return true;
    } catch (cause) {
      setActionError(
        t(
          isScheduleVersionConflict(cause)
            ? "scheduleConflict"
            : "scheduleSaveFailed",
        ),
      );
      return false;
    }
  }
  const override = schedule.overrides.find(
    (item) => item.localDate === overrideDate,
  );
  const overrideWeekday = Temporal.PlainDate.from(overrideDate).dayOfWeek;
  const resolvedOverride =
    override?.intervals ??
    schedule.weekly.filter((item) => item.isoWeekday === overrideWeekday);
  const currentRestoreReview =
    restoreReview?.localDate === overrideDate ? restoreReview : null;
  const restoreReviewStale =
    currentRestoreReview !== null &&
    currentRestoreReview.openedVersion !== schedule.version;
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

  function weeklyIntervalContext(
    original?: ScheduleInterval,
  ): ScheduleIntervalContext {
    const previous = weekday === 1 ? 7 : weekday - 1;
    const following = weekday === 7 ? 1 : weekday + 1;
    const previousDayIntervals = weeklySchedule.filter(
      (item) => item.isoWeekday === previous,
    );
    const nextDayIntervals = weeklySchedule.filter(
      (item) => item.isoWeekday === following,
    );
    return {
      scope: { kind: "weekly", isoWeekday: weekday },
      mode: original ? "edit" : "create",
      intervals: weeklyIntervals,
      original,
      allowNextDay: true,
      openedVersion: scheduleVersion,
      previousDayScope: { kind: "weekly", isoWeekday: previous },
      previousDayIntervals,
      nextDayIntervals,
      nextDayScope: { kind: "weekly", isoWeekday: following },
      onSave: (next, expectedVersion) =>
        onReplaceWeekly(weekday, next, expectedVersion),
      onSaveNextDay: (current, next, expectedVersion) => {
        compileScheduleWritePlan([
          {
            day: { kind: "weekly", isoWeekday: weekday },
            intervals: current,
          },
          {
            day: { kind: "weekly", isoWeekday: following },
            intervals: next,
          },
        ]);
        return onReplaceWeeklyPair(
          weekday,
          current,
          following,
          next,
          expectedVersion,
        );
      },
      onSavePreviousDay: (previousIntervals, current, expectedVersion) => {
        compileScheduleWritePlan([
          {
            day: { kind: "weekly", isoWeekday: previous },
            intervals: previousIntervals,
          },
          {
            day: { kind: "weekly", isoWeekday: weekday },
            intervals: current,
          },
        ]);
        return onReplaceWeeklyPair(
          previous,
          previousIntervals,
          weekday,
          current,
          expectedVersion,
        );
      },
    };
  }

  function overrideIntervalContext(
    original?: ScheduleInterval,
  ): ScheduleIntervalContext {
    const allowNextDay = overrideDate < "9999-12-31";
    const allowPreviousDay = overrideDate > "0001-01-01";
    const previousDate = allowPreviousDay
      ? Temporal.PlainDate.from(overrideDate).subtract({ days: 1 })
      : null;
    const previousDateString = previousDate?.toString() ?? null;
    const previousOverride = previousDateString
      ? scheduleOverrides.find((item) => item.localDate === previousDateString)
      : undefined;
    const previousDayIntervals =
      previousOverride?.intervals ??
      (previousDate
        ? weeklySchedule.filter(
            (item) => item.isoWeekday === previousDate.dayOfWeek,
          )
        : []);
    const followingDate = allowNextDay
      ? Temporal.PlainDate.from(overrideDate).add({ days: 1 })
      : null;
    const followingDateString = followingDate?.toString() ?? null;
    const followingOverride = followingDateString
      ? scheduleOverrides.find((item) => item.localDate === followingDateString)
      : undefined;
    const nextDayIntervals =
      followingOverride?.intervals ??
      (followingDate
        ? weeklySchedule.filter(
            (item) => item.isoWeekday === followingDate.dayOfWeek,
          )
        : []);
    return {
      scope: { kind: "date", localDate: overrideDate },
      mode: original ? "edit" : "create",
      intervals: resolvedOverride,
      original,
      allowNextDay,
      openedVersion: scheduleVersion,
      previousDayScope: previousDateString
        ? { kind: "date", localDate: previousDateString }
        : undefined,
      previousDayIntervals,
      nextDayIntervals,
      nextDayScope: followingDateString
        ? { kind: "date", localDate: followingDateString }
        : undefined,
      onSave: (next, expectedVersion) =>
        onReplaceOverride(overrideDate, next, expectedVersion),
      onSaveNextDay: (current, next, expectedVersion) => {
        if (!followingDateString)
          throw new RangeError("next_day_outside_supported_range");
        compileScheduleWritePlan([
          {
            day: { kind: "date", localDate: overrideDate },
            intervals: current,
          },
          {
            day: { kind: "date", localDate: followingDateString },
            intervals: next,
          },
        ]);
        return onReplaceOverridePair(
          overrideDate,
          current,
          followingDateString,
          next,
          expectedVersion,
        );
      },
      onSavePreviousDay: previousDateString
        ? (previousIntervals, current, expectedVersion) => {
            compileScheduleWritePlan([
              {
                day: { kind: "date", localDate: previousDateString },
                intervals: previousIntervals,
              },
              {
                day: { kind: "date", localDate: overrideDate },
                intervals: current,
              },
            ]);
            return onReplaceOverridePair(
              previousDateString,
              previousIntervals,
              overrideDate,
              current,
              expectedVersion,
            );
          }
        : undefined,
    };
  }

  return (
    <section className="schedule-page" aria-labelledby="schedule-heading">
      <header className="view-heading">
        <div>
          <p className="eyebrow">
            {t("scheduleZone")}: {schedule.timeZone}
          </p>
          <h1 id="schedule-heading" tabIndex={-1}>
            {t("mySchedule")}
          </h1>
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

      <div
        className="schedule-mobile-tabs"
        role="tablist"
        aria-label={t("mySchedule")}
      >
        {(
          [
            ["weekly", t("weeklyTemplate")],
            ["override", t("dateOverride")],
            ["timezone", t("timezoneSection")],
          ] as const
        ).map(([id, label]) => (
          <button
            role="tab"
            type="button"
            key={id}
            aria-selected={activeSection === id}
            className={activeSection === id ? "active" : undefined}
            onClick={() => setActiveSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        className="editor-section"
        hidden={compact && activeSection !== "weekly"}
      >
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
        <IntervalList
          intervals={weeklyIntervals}
          onEdit={(interval) => onOpenInterval(weeklyIntervalContext(interval))}
        />
        <button
          className="button button-secondary add-time-button"
          type="button"
          onClick={() => onOpenInterval(weeklyIntervalContext())}
        >
          {t("addTime")}
        </button>
        <PaintForm
          key={`weekly-${weekday}`}
          intervals={weeklyIntervals}
          nextDayIntervals={schedule.weekly.filter(
            (item) => item.isoWeekday === (weekday === 7 ? 1 : weekday + 1),
          )}
          version={schedule.version}
          online={online}
          onPaint={(next, expectedVersion) =>
            onReplaceWeekly(weekday, next, expectedVersion)
          }
          onPaintNextDay={(current, next, expectedVersion) => {
            const nextWeekday = weekday === 7 ? 1 : weekday + 1;
            return onReplaceWeeklyPair(
              weekday,
              current,
              nextWeekday,
              next,
              expectedVersion,
            );
          }}
        />
      </section>

      <section
        className="editor-section"
        hidden={compact && activeSection !== "override"}
      >
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
          {override ? t("usingOverride") : t("usingTemplate")}
        </p>
        <IntervalList
          intervals={resolvedOverride}
          onEdit={(interval) =>
            onOpenInterval(overrideIntervalContext(interval))
          }
        />
        <button
          className="button button-secondary add-time-button"
          type="button"
          onClick={() => onOpenInterval(overrideIntervalContext())}
        >
          {t("addTime")}
        </button>
        <PaintForm
          key={`override-${overrideDate}`}
          intervals={resolvedOverride}
          nextDayIntervals={
            overrideDate < "9999-12-31"
              ? (() => {
                  const nextDate = Temporal.PlainDate.from(overrideDate).add({
                    days: 1,
                  });
                  return (
                    schedule.overrides.find(
                      (item) => item.localDate === nextDate.toString(),
                    )?.intervals ??
                    schedule.weekly.filter(
                      (item) => item.isoWeekday === nextDate.dayOfWeek,
                    )
                  );
                })()
              : []
          }
          version={schedule.version}
          online={online}
          allowNextDay={overrideDate < "9999-12-31"}
          onPaint={(next, expectedVersion) =>
            onReplaceOverride(overrideDate, next, expectedVersion)
          }
          onPaintNextDay={(current, next, expectedVersion) => {
            const nextDate = Temporal.PlainDate.from(overrideDate).add({
              days: 1,
            });
            const nextDateString = nextDate.toString();
            return onReplaceOverridePair(
              overrideDate,
              current,
              nextDateString,
              next,
              expectedVersion,
            );
          }}
        />
        {override && (!currentRestoreReview || restoreReviewStale) && (
          <button
            className="button button-secondary"
            type="button"
            onClick={() =>
              setRestoreReview({
                localDate: overrideDate,
                openedVersion: schedule.version,
              })
            }
          >
            {t("restoreTemplate")}
          </button>
        )}
        {override && restoreReviewStale && (
          <p className="form-error" role="alert">
            {t("scheduleConflict")}
          </p>
        )}
        {override && currentRestoreReview && !restoreReviewStale && (
          <div className="inline-action-confirmation" role="alert">
            <p>{t("restoreTemplateWarning")}</p>
            <div>
              <button
                className="button button-danger"
                type="button"
                disabled={!online}
                onClick={() =>
                  void runScheduleAction(() =>
                    onRestoreOverride(
                      overrideDate,
                      currentRestoreReview.openedVersion,
                    ),
                  ).then((saved) => {
                    if (saved) setRestoreReview(null);
                  })
                }
              >
                {t("confirmAction")}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setRestoreReview(null)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
      </section>

      <section
        className="editor-section zone-section"
        hidden={compact && activeSection !== "timezone"}
      >
        <div className="section-heading">
          <div>
            <span className="section-number">03</span>
            <h2>{t("changeScheduleZone")}</h2>
          </div>
        </div>
        {compact ? (
          <button
            className="button button-primary"
            type="button"
            onClick={() =>
              onOpenTimezone({
                onViewerTimeZone,
                onMigrateZone: onMigrateZone,
              })
            }
          >
            {t("reviewTimezone")}
          </button>
        ) : (
          <>
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
              disabled={zoneMode === "migrate" && !online}
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
          </>
        )}
      </section>
    </section>
  );
}
