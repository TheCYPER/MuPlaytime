import { Temporal } from "@js-temporal/polyfill";
import type { ScheduleInterval, WeeklyInterval } from "../domain/types";
import { MINUTES_PER_DAY, canonicalizeIntervals } from "./intervals";

export interface DstAnnotation {
  kind: "skipped" | "repeated";
  localDate: string;
  minute: number;
}

export interface InstantInterval {
  startEpochMilliseconds: number;
  endEpochMilliseconds: number;
  state: ScheduleInterval["state"];
}

export interface ResolvedDay {
  intervals: InstantInterval[];
  annotations: DstAnnotation[];
}

export function isNamedIanaTimeZone(timeZone: string): boolean {
  if (/^[+-]\d{2}(?::?\d{2})?$/.test(timeZone)) return false;
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

function assertNamedIanaTimeZone(timeZone: string): void {
  if (!isNamedIanaTimeZone(timeZone)) throw new RangeError("time_zone_invalid");
}

function samePlainDateTime(
  left: Temporal.PlainDateTime,
  right: Temporal.PlainDateTime,
): boolean {
  return left.equals(right);
}

function possibleMinuteStarts(
  local: Temporal.PlainDateTime,
  timeZone: string,
): number[] {
  try {
    const exact = local.toZonedDateTime(timeZone, { disambiguation: "reject" });
    return [exact.epochMilliseconds];
  } catch {
    const earlier = local.toZonedDateTime(timeZone, {
      disambiguation: "earlier",
    });
    const later = local.toZonedDateTime(timeZone, { disambiguation: "later" });
    const earlierMatches = samePlainDateTime(earlier.toPlainDateTime(), local);
    const laterMatches = samePlainDateTime(later.toPlainDateTime(), local);
    if (!earlierMatches && !laterMatches) {
      return [];
    }
    return [
      ...new Set(
        [earlier, later]
          .filter((item) => samePlainDateTime(item.toPlainDateTime(), local))
          .map((item) => item.epochMilliseconds),
      ),
    ].sort((a, b) => a - b);
  }
}

function localMinute(
  date: Temporal.PlainDate,
  minute: number,
): Temporal.PlainDateTime {
  const targetDate = minute === MINUTES_PER_DAY ? date.add({ days: 1 }) : date;
  const dayMinute = minute % MINUTES_PER_DAY;
  return targetDate.toPlainDateTime({
    hour: Math.floor(dayMinute / 60),
    minute: dayMinute % 60,
  });
}

export function resolveLocalIntervals(
  localDate: string,
  intervals: readonly ScheduleInterval[],
  timeZone: string,
): ResolvedDay {
  assertNamedIanaTimeZone(timeZone);
  const date = Temporal.PlainDate.from(localDate);
  const result: InstantInterval[] = [];
  const annotations: DstAnnotation[] = [];

  for (const interval of canonicalizeIntervals(intervals)) {
    for (
      let minute = interval.startMinute;
      minute < interval.endMinute;
      minute += 1
    ) {
      const starts = possibleMinuteStarts(localMinute(date, minute), timeZone);
      if (starts.length === 0) {
        annotations.push({ kind: "skipped", localDate, minute });
      } else if (starts.length > 1) {
        annotations.push({ kind: "repeated", localDate, minute });
      }
      for (const start of starts) {
        result.push({
          startEpochMilliseconds: start,
          endEpochMilliseconds: start + 60_000,
          state: interval.state,
        });
      }
    }
  }

  result.sort(
    (left, right) => left.startEpochMilliseconds - right.startEpochMilliseconds,
  );
  const coalesced: InstantInterval[] = [];
  for (const interval of result) {
    const previous = coalesced.at(-1);
    if (
      previous &&
      previous.state === interval.state &&
      previous.endEpochMilliseconds === interval.startEpochMilliseconds
    ) {
      previous.endEpochMilliseconds = interval.endEpochMilliseconds;
    } else if (
      interval.endEpochMilliseconds > interval.startEpochMilliseconds
    ) {
      coalesced.push({ ...interval });
    }
  }
  return { intervals: coalesced, annotations };
}

export function resolveWeeklyDay(
  localDate: string,
  weekly: readonly WeeklyInterval[],
  timeZone: string,
): ResolvedDay {
  const weekday = Temporal.PlainDate.from(localDate).dayOfWeek;
  return resolveLocalIntervals(
    localDate,
    weekly.filter((interval) => interval.isoWeekday === weekday),
    timeZone,
  );
}

export interface LocalInstantChoice {
  instant: string;
  offset: string;
}

export function localProposalChoices(
  localDateTime: string,
  timeZone: string,
): LocalInstantChoice[] {
  assertNamedIanaTimeZone(timeZone);
  const plain = Temporal.PlainDateTime.from(localDateTime);
  return possibleMinuteStarts(plain, timeZone).map((epochMilliseconds) => {
    const instant = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds);
    const zoned = instant.toZonedDateTimeISO(timeZone);
    return { instant: instant.toString(), offset: zoned.offset };
  });
}

export function projectInstant(
  instant: string,
  timeZone: string,
): Temporal.ZonedDateTime {
  assertNamedIanaTimeZone(timeZone);
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone);
}
