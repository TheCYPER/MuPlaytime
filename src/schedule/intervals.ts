import type {
  ScheduleInterval,
  ScheduleState,
  WeeklyInterval,
} from "../domain/types";

export const MINUTES_PER_DAY = 1440;
export const EDITOR_STEP_MINUTES = 30;

function assertMinute(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MINUTES_PER_DAY) {
    throw new RangeError(`${label}_invalid`);
  }
}

export function validateInterval(interval: ScheduleInterval): void {
  assertMinute(interval.startMinute, "start_minute");
  assertMinute(interval.endMinute, "end_minute");
  if (interval.endMinute <= interval.startMinute) {
    throw new RangeError("interval_order_invalid");
  }
}

export function canonicalizeIntervals(
  intervals: readonly ScheduleInterval[],
): ScheduleInterval[] {
  const sorted = intervals
    .map((interval) => ({ ...interval }))
    .sort((left, right) => left.startMinute - right.startMinute);
  const result: ScheduleInterval[] = [];

  for (const interval of sorted) {
    validateInterval(interval);
    const previous = result.at(-1);
    if (previous && interval.startMinute < previous.endMinute) {
      throw new RangeError("intervals_overlap");
    }
    if (
      previous &&
      interval.startMinute === previous.endMinute &&
      interval.state === previous.state
    ) {
      previous.endMinute = interval.endMinute;
    } else {
      result.push(interval);
    }
  }

  return result;
}

export function paintInterval(
  existing: readonly ScheduleInterval[],
  startMinute: number,
  endMinute: number,
  state: ScheduleState | "unknown",
): ScheduleInterval[] {
  const painted: ScheduleInterval = {
    startMinute,
    endMinute,
    state: state === "unknown" ? "free" : state,
  };
  validateInterval(painted);

  const next: ScheduleInterval[] = [];
  for (const interval of canonicalizeIntervals(existing)) {
    if (
      interval.endMinute <= startMinute ||
      interval.startMinute >= endMinute
    ) {
      next.push(interval);
      continue;
    }
    if (interval.startMinute < startMinute) {
      next.push({ ...interval, endMinute: startMinute });
    }
    if (interval.endMinute > endMinute) {
      next.push({ ...interval, startMinute: endMinute });
    }
  }
  if (state !== "unknown") {
    next.push({ startMinute, endMinute, state });
  }
  return canonicalizeIntervals(next);
}

export function snapshotResolvedDay(
  resolved: readonly ScheduleInterval[],
): ScheduleInterval[] {
  return canonicalizeIntervals(resolved);
}

export function splitAcrossMidnight(
  isoWeekday: number,
  startMinute: number,
  endMinute: number,
  state: ScheduleState,
): WeeklyInterval[] {
  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    throw new RangeError("weekday_invalid");
  }
  assertMinute(startMinute, "start_minute");
  if (startMinute === MINUTES_PER_DAY) {
    throw new RangeError("start_minute_invalid");
  }
  if (
    !Number.isInteger(endMinute) ||
    endMinute <= startMinute ||
    endMinute > 2880
  ) {
    throw new RangeError("end_minute_invalid");
  }

  if (endMinute <= MINUTES_PER_DAY) {
    return [{ isoWeekday, startMinute, endMinute, state }];
  }
  const followingDay = isoWeekday === 7 ? 1 : isoWeekday + 1;
  return [
    { isoWeekday, startMinute, endMinute: MINUTES_PER_DAY, state },
    {
      isoWeekday: followingDay,
      startMinute: 0,
      endMinute: endMinute - MINUTES_PER_DAY,
      state,
    },
  ];
}

export function formatMinute(minute: number): string {
  assertMinute(minute, "minute");
  if (minute === MINUTES_PER_DAY) return "24:00";
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
