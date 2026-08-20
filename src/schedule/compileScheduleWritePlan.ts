import type { ScheduleInterval } from "../domain/types";
import { Temporal } from "@js-temporal/polyfill";

export type DayScope =
  { kind: "weekly"; isoWeekday: number } | { kind: "date"; localDate: string };

export type ScheduleWritePlan =
  | { kind: "single"; day: DayScope; intervals: ScheduleInterval[] }
  | {
      kind: "orderedPair";
      first: DayScope;
      firstIntervals: ScheduleInterval[];
      second: DayScope;
      secondIntervals: ScheduleInterval[];
    };

function isAdjacent(first: DayScope, second: DayScope): boolean {
  if (first.kind !== second.kind) return false;
  if (first.kind === "weekly" && second.kind === "weekly")
    return (
      second.isoWeekday === (first.isoWeekday === 7 ? 1 : first.isoWeekday + 1)
    );
  if (first.kind === "date" && second.kind === "date") {
    const firstDay = Temporal.PlainDate.from(first.localDate);
    return firstDay.add({ days: 1 }).equals(second.localDate);
  }
  return false;
}

export function compileScheduleWritePlan(
  entries: readonly { day: DayScope; intervals: ScheduleInterval[] }[],
): ScheduleWritePlan {
  if (entries.length === 1 && entries[0])
    return { kind: "single", ...entries[0] };
  if (
    entries.length === 2 &&
    entries[0] &&
    entries[1] &&
    isAdjacent(entries[0].day, entries[1].day)
  ) {
    return {
      kind: "orderedPair",
      first: entries[0].day,
      firstIntervals: entries[0].intervals,
      second: entries[1].day,
      secondIntervals: entries[1].intervals,
    };
  }
  throw new RangeError("schedule_write_plan_requires_one_or_two_adjacent_days");
}
