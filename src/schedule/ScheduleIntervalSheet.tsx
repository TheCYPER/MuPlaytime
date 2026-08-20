import { useState, type FormEvent } from "react";
import type { ScheduleInterval, ScheduleState } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { isScheduleVersionConflict } from "../data/repository";
import { formatMinute, paintInterval } from "./intervals";
import {
  compileScheduleWritePlan,
  type DayScope,
} from "./compileScheduleWritePlan";

function timeToMinute(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    hours === undefined ||
    minutes === undefined ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  )
    throw new RangeError("invalid_time");
  return hours * 60 + minutes;
}

function inputTime(minute: number): string {
  return minute === 1440 ? "00:00" : formatMinute(minute);
}

export interface ScheduleIntervalContext {
  scope: DayScope;
  mode: "create" | "edit";
  intervals: readonly ScheduleInterval[];
  original?: ScheduleInterval;
  allowNextDay: boolean;
  openedVersion: number;
  previousDayScope?: DayScope;
  previousDayIntervals: readonly ScheduleInterval[];
  nextDayIntervals: readonly ScheduleInterval[];
  nextDayScope?: DayScope;
  onSave: (
    intervals: ScheduleInterval[],
    expectedVersion: number,
  ) => Promise<void>;
  onSaveNextDay: (
    currentDay: ScheduleInterval[],
    nextDay: ScheduleInterval[],
    expectedVersion: number,
  ) => Promise<void>;
  onSavePreviousDay?: (
    previousDay: ScheduleInterval[],
    currentDay: ScheduleInterval[],
    expectedVersion: number,
  ) => Promise<void>;
}

export function ScheduleIntervalSheet({
  context,
  online,
  latestVersion,
  latestIntervals,
  latestPreviousDayIntervals,
  latestNextDayIntervals,
  onClose,
}: {
  context: ScheduleIntervalContext;
  online: boolean;
  latestVersion: number;
  latestIntervals: readonly ScheduleInterval[];
  latestPreviousDayIntervals: readonly ScheduleInterval[];
  latestNextDayIntervals: readonly ScheduleInterval[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const original = context.original;
  const [start, setStart] = useState(() =>
    inputTime(original?.startMinute ?? 1080),
  );
  const [end, setEnd] = useState(() => inputTime(original?.endMinute ?? 1200));
  const [state, setState] = useState<ScheduleState>(original?.state ?? "free");
  // Stored midnight-ending segments are independent day parts. Cross-midnight
  // composition is always an explicit, default-off choice.
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [adjacentDirection, setAdjacentDirection] = useState<
    "previous" | "next" | null
  >(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);

  const previousCandidate =
    original?.startMinute === 0
      ? context.previousDayIntervals.find(
          (interval) =>
            interval.endMinute === 1440 && interval.state === original.state,
        )
      : undefined;
  const nextCandidate =
    original?.endMinute === 1440
      ? context.nextDayIntervals.find(
          (interval) =>
            interval.startMinute === 0 && interval.state === original.state,
        )
      : undefined;

  function sameInterval(
    left: ScheduleInterval,
    right: ScheduleInterval,
  ): boolean {
    return (
      left.startMinute === right.startMinute &&
      left.endMinute === right.endMinute &&
      left.state === right.state
    );
  }

  const originalStillMatches = original
    ? latestIntervals.some(
        (interval) =>
          interval.startMinute === original.startMinute &&
          interval.endMinute === original.endMinute &&
          interval.state === original.state,
      )
    : true;
  const adjacentStillMatches =
    adjacentDirection === "previous" && previousCandidate
      ? latestPreviousDayIntervals.some((interval) =>
          sameInterval(interval, previousCandidate),
        )
      : adjacentDirection === "next" && nextCandidate
        ? latestNextDayIntervals.some((interval) =>
            sameInterval(interval, nextCandidate),
          )
        : true;
  const conflictActionBlocked =
    conflicted &&
    (!originalStillMatches ||
      !adjacentStillMatches ||
      reviewedVersion !== latestVersion);

  async function run(operation: () => Promise<void>) {
    if (!online) {
      setError(t("writesOffline"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await operation();
      onClose();
    } catch (cause) {
      setError(
        t(
          isScheduleVersionConflict(cause)
            ? "scheduleConflict"
            : "scheduleSaveFailed",
        ),
      );
      if (isScheduleVersionConflict(cause)) {
        setConflicted(true);
        setReviewedVersion(null);
      }
    } finally {
      setPending(false);
    }
  }

  function baseWithoutOriginal(): ScheduleInterval[] {
    const source = conflicted ? latestIntervals : context.intervals;
    if (!original) return [...source];
    return paintInterval(
      source,
      original.startMinute,
      original.endMinute,
      "unknown",
    );
  }

  function chooseAdjacent(direction: "previous" | "next" | null) {
    setReviewedVersion(null);
    setAdjacentDirection(direction);
    if (!direction) {
      setEndsNextDay(false);
      if (original) {
        setStart(inputTime(original.startMinute));
        setEnd(inputTime(original.endMinute));
      }
      return;
    }
    const candidate =
      direction === "previous" ? previousCandidate : nextCandidate;
    if (!candidate || !original) return;
    setEndsNextDay(true);
    if (direction === "previous") {
      setStart(inputTime(candidate.startMinute));
      setEnd(inputTime(original.endMinute));
    } else {
      setStart(inputTime(original.startMinute));
      setEnd(inputTime(candidate.endMinute));
    }
  }

  const threeDayRisk =
    Boolean(previousCandidate) && endsNextDay && adjacentDirection === null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (conflictActionBlocked) return;
    try {
      const startMinute = timeToMinute(start);
      const parsedEndMinute = timeToMinute(end);
      const endMinute =
        parsedEndMinute === 0 && !endsNextDay ? 1440 : parsedEndMinute;
      const base = baseWithoutOriginal();
      const expectedVersion = conflicted
        ? latestVersion
        : context.openedVersion;
      if (adjacentDirection === "previous") {
        if (
          !previousCandidate ||
          !context.previousDayScope ||
          !context.onSavePreviousDay ||
          endMinute > startMinute
        )
          throw new RangeError("previous_adjacent_plan_invalid");
        const previousSource = conflicted
          ? latestPreviousDayIntervals
          : context.previousDayIntervals;
        const previousBase = paintInterval(
          previousSource,
          previousCandidate.startMinute,
          previousCandidate.endMinute,
          "unknown",
        );
        const previous = paintInterval(previousBase, startMinute, 1440, state);
        const current =
          endMinute === 0
            ? [...base]
            : paintInterval(base, 0, endMinute, state);
        compileScheduleWritePlan([
          { day: context.previousDayScope, intervals: previous },
          { day: context.scope, intervals: current },
        ]);
        void run(() =>
          context.onSavePreviousDay!(previous, current, expectedVersion),
        );
      } else if (endsNextDay && context.allowNextDay) {
        if (endMinute > startMinute)
          throw new RangeError("cross_midnight_range_invalid");
        const current = paintInterval(base, startMinute, 1440, state);
        const nextSource = conflicted
          ? latestNextDayIntervals
          : context.nextDayIntervals;
        const nextBase =
          adjacentDirection === "next" && nextCandidate
            ? paintInterval(
                nextSource,
                nextCandidate.startMinute,
                nextCandidate.endMinute,
                "unknown",
              )
            : [...nextSource];
        const next =
          endMinute === 0
            ? [...nextBase]
            : paintInterval(nextBase, 0, endMinute, state);
        const affectsNextDay = endMinute !== 0 || adjacentDirection === "next";
        if (!affectsNextDay) {
          compileScheduleWritePlan([
            { day: context.scope, intervals: current },
          ]);
        } else {
          if (!context.nextDayScope)
            throw new RangeError("next_day_scope_missing");
          compileScheduleWritePlan([
            { day: context.scope, intervals: current },
            { day: context.nextDayScope, intervals: next },
          ]);
        }
        void run(() =>
          affectsNextDay
            ? context.onSaveNextDay(current, next, expectedVersion)
            : context.onSave(current, expectedVersion),
        );
      } else {
        const next = paintInterval(base, startMinute, endMinute, state);
        compileScheduleWritePlan([{ day: context.scope, intervals: next }]);
        void run(() => context.onSave(next, expectedVersion));
      }
    } catch {
      setError(t("invalidTime"));
    }
  }

  function clearOriginal() {
    if (!original || conflictActionBlocked) return;
    const next = paintInterval(
      conflicted ? latestIntervals : context.intervals,
      original.startMinute,
      original.endMinute,
      "unknown",
    );
    compileScheduleWritePlan([{ day: context.scope, intervals: next }]);
    void run(() =>
      context.onSave(next, conflicted ? latestVersion : context.openedVersion),
    );
  }

  function intervalSummary(value: readonly ScheduleInterval[]): string {
    if (value.length === 0) return t("unknown");
    return value
      .map(
        (interval) =>
          `${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)} ${t(interval.state)}`,
      )
      .join(" · ");
  }

  function draftPreview(useLatest: boolean): {
    current: string;
    intended: string;
  } | null {
    try {
      const startMinute = timeToMinute(start);
      const parsedEndMinute = timeToMinute(end);
      const endMinute =
        parsedEndMinute === 0 && !endsNextDay ? 1440 : parsedEndMinute;
      const currentSource = useLatest ? latestIntervals : context.intervals;
      const currentBase = original
        ? paintInterval(
            currentSource,
            original.startMinute,
            original.endMinute,
            "unknown",
          )
        : [...currentSource];
      if (adjacentDirection === "previous" && previousCandidate) {
        const previousSource = useLatest
          ? latestPreviousDayIntervals
          : context.previousDayIntervals;
        const previousBase = paintInterval(
          previousSource,
          previousCandidate.startMinute,
          previousCandidate.endMinute,
          "unknown",
        );
        const intendedPrevious = paintInterval(
          previousBase,
          startMinute,
          1440,
          state,
        );
        const intendedCurrent =
          endMinute === 0
            ? [...currentBase]
            : paintInterval(currentBase, 0, endMinute, state);
        return {
          current: `${intervalSummary(previousSource)} → ${intervalSummary(currentSource)}`,
          intended: `${intervalSummary(intendedPrevious)} → ${intervalSummary(intendedCurrent)}`,
        };
      }
      if (endsNextDay) {
        const nextSource = useLatest
          ? latestNextDayIntervals
          : context.nextDayIntervals;
        const nextBase =
          adjacentDirection === "next" && nextCandidate
            ? paintInterval(
                nextSource,
                nextCandidate.startMinute,
                nextCandidate.endMinute,
                "unknown",
              )
            : [...nextSource];
        const intendedCurrent = paintInterval(
          currentBase,
          startMinute,
          1440,
          state,
        );
        const intendedNext =
          endMinute === 0
            ? [...nextBase]
            : paintInterval(nextBase, 0, endMinute, state);
        return {
          current: `${intervalSummary(currentSource)} → ${intervalSummary(nextSource)}`,
          intended: `${intervalSummary(intendedCurrent)} → ${intervalSummary(intendedNext)}`,
        };
      }
      return {
        current: intervalSummary(currentSource),
        intended: intervalSummary(
          paintInterval(currentBase, startMinute, endMinute, state),
        ),
      };
    } catch {
      return null;
    }
  }

  const reviewedDraftPreview =
    conflicted || endsNextDay ? draftPreview(conflicted) : null;

  return (
    <form className="schedule-interval-form" onSubmit={submit}>
      <p className="section-note" data-dialog-initial-focus tabIndex={-1}>
        {context.mode === "edit" && original
          ? `${t("currentSchedule")}: ${formatMinute(original.startMinute)}–${formatMinute(original.endMinute)} · ${t(original.state)}`
          : t("addTime")}
      </p>
      <div className="schedule-interval-fields">
        <label className="field">
          <span>{t("start")}</span>
          <input
            type="time"
            step={1800}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("end")}</span>
          <input
            type="time"
            step={1800}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span>{t("state")}</span>
        <select
          value={state}
          onChange={(event) => setState(event.target.value as ScheduleState)}
        >
          <option value="free">{t("free")}</option>
          <option value="busy">{t("busy")}</option>
        </select>
      </label>
      {(previousCandidate || nextCandidate) && (
        <fieldset className="offset-choices adjacent-segment-choices">
          <legend>{t("adjacentSegment")}</legend>
          <label>
            <input
              type="radio"
              name="schedule-adjacent-segment"
              checked={adjacentDirection === null}
              onChange={() => chooseAdjacent(null)}
            />
            <span>{t("editSelectedOnly")}</span>
          </label>
          {previousCandidate && (
            <label>
              <input
                type="radio"
                name="schedule-adjacent-segment"
                checked={adjacentDirection === "previous"}
                disabled={threeDayRisk}
                onChange={() => chooseAdjacent("previous")}
              />
              <span>
                {t("alsoEditPreviousSegment")} ·{" "}
                {formatMinute(previousCandidate.startMinute)}–
                {formatMinute(previousCandidate.endMinute)}
              </span>
            </label>
          )}
          {nextCandidate && (
            <label>
              <input
                type="radio"
                name="schedule-adjacent-segment"
                checked={adjacentDirection === "next"}
                onChange={() => chooseAdjacent("next")}
              />
              <span>
                {t("alsoEditNextSegment")} ·{" "}
                {formatMinute(nextCandidate.startMinute)}–
                {formatMinute(nextCandidate.endMinute)}
              </span>
            </label>
          )}
        </fieldset>
      )}
      {threeDayRisk && (
        <p className="form-error" role="alert">
          {t("adjustInTwoEdits")}
        </p>
      )}
      <label className="choice-row">
        <input
          type="checkbox"
          checked={endsNextDay}
          disabled={adjacentDirection !== "previous" && !context.allowNextDay}
          onChange={(event) => {
            setEndsNextDay(event.target.checked);
            if (!event.target.checked) setAdjacentDirection(null);
          }}
        />
        <span>{t("endsNextDay")}</span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {conflicted && (!originalStillMatches || !adjacentStillMatches) && (
        <p className="form-error" role="alert">
          {t("intervalChanged")}
        </p>
      )}
      {reviewedDraftPreview &&
        (!conflicted || (originalStillMatches && adjacentStillMatches)) && (
          <div className="quick-paint-rebase" role="status">
            <strong>{t("affectedDaysPreview")}</strong>
            <dl>
              <div>
                <dt>{t("currentSchedule")}</dt>
                <dd className="mono">{reviewedDraftPreview.current}</dd>
              </div>
              <div>
                <dt>{t("previewAfter")}</dt>
                <dd className="mono">{reviewedDraftPreview.intended}</dd>
              </div>
            </dl>
          </div>
        )}
      {conflicted && originalStillMatches && adjacentStillMatches && (
        <button
          className="button button-secondary"
          type="button"
          disabled={pending || !online}
          onClick={() => {
            setError(null);
            setReviewedVersion(latestVersion);
          }}
        >
          {t("reviewAndRetry")}
        </button>
      )}
      <div className="schedule-sheet-actions">
        <button
          className="button button-primary"
          type="submit"
          disabled={
            pending ||
            !online ||
            (conflicted &&
              (!originalStillMatches || reviewedVersion !== latestVersion))
          }
        >
          {pending ? t("saving") : t("saveChanges")}
        </button>
        {original && !confirmingClear && (
          <button
            className="button button-danger"
            type="button"
            disabled={pending || conflictActionBlocked}
            onClick={() => setConfirmingClear(true)}
          >
            {t("clearTime")}
          </button>
        )}
      </div>
      {confirmingClear && original && (
        <div className="inline-clear-confirmation" role="alert">
          <p>{t("clearWarning")}</p>
          <div>
            <button
              className="button button-danger"
              type="button"
              disabled={pending || !online || conflictActionBlocked}
              onClick={clearOriginal}
            >
              {t("confirmClear")}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setConfirmingClear(false)}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
