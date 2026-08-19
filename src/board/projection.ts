import { Temporal } from "@js-temporal/polyfill";
import type {
  MemberStatus,
  RoomSnapshot,
  ScheduleInterval,
  ScheduleSet,
} from "../domain/types";
import {
  sweepOverlap,
  type MemberInstantSchedule,
  type OverlapSegment,
} from "../schedule/overlap";
import {
  isNamedIanaTimeZone,
  resolveLocalIntervals,
  type DstAnnotation,
  type InstantInterval,
} from "../schedule/timezone";

export interface BoardDstAnnotation extends DstAnnotation {
  memberId: RoomSnapshot["currentMemberId"];
  timeZone: string;
}

export interface BoardProjection {
  rangeStart: number;
  rangeEnd: number;
  schedules: MemberInstantSchedule[];
  segments: OverlapSegment[];
  annotations: BoardDstAnnotation[];
  skippedViewerDate: boolean;
}

function dayIntervals(
  schedule: ScheduleSet,
  localDate: string,
): ScheduleInterval[] {
  const override = schedule.overrides.find(
    (item) => item.localDate === localDate,
  );
  if (override) return override.intervals;
  const weekday = Temporal.PlainDate.from(localDate).dayOfWeek;
  return schedule.weekly.filter((item) => item.isoWeekday === weekday);
}

function iterateDates(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): string[] {
  const result: string[] = [];
  let cursor = start;
  while (Temporal.PlainDate.compare(cursor, end) <= 0) {
    result.push(cursor.toString());
    cursor = cursor.add({ days: 1 });
  }
  return result;
}

export function projectBoardDay(
  snapshot: RoomSnapshot,
  viewerLocalDate: string,
  viewerTimeZone: string,
): BoardProjection {
  if (!isNamedIanaTimeZone(viewerTimeZone))
    throw new RangeError("time_zone_invalid");
  const viewerDate = Temporal.PlainDate.from(viewerLocalDate);
  const start = viewerDate.toZonedDateTime({
    timeZone: viewerTimeZone,
    plainTime: Temporal.PlainTime.from("00:00"),
  });
  const end = viewerDate.add({ days: 1 }).toZonedDateTime({
    timeZone: viewerTimeZone,
    plainTime: Temporal.PlainTime.from("00:00"),
  });
  const rangeStart = start.epochMilliseconds;
  const rangeEnd = end.epochMilliseconds;

  if (rangeEnd <= rangeStart) {
    return {
      rangeStart,
      rangeEnd,
      schedules: snapshot.members.map((member) => ({
        memberId: member.id,
        intervals: [],
      })),
      segments: [],
      annotations: [],
      skippedViewerDate: true,
    };
  }

  const annotations: BoardDstAnnotation[] = [];
  const schedules: MemberInstantSchedule[] = snapshot.members.map((member) => {
    const schedule = snapshot.schedules.find(
      (item) => item.memberId === member.id,
    );
    if (!schedule) return { memberId: member.id, intervals: [] };
    const startDate = Temporal.Instant.fromEpochMilliseconds(rangeStart)
      .toZonedDateTimeISO(schedule.timeZone)
      .toPlainDate()
      .subtract({ days: 1 });
    const endDate = Temporal.Instant.fromEpochMilliseconds(rangeEnd - 1)
      .toZonedDateTimeISO(schedule.timeZone)
      .toPlainDate()
      .add({ days: 1 });
    const intervals: InstantInterval[] = [];
    for (const localDate of iterateDates(startDate, endDate)) {
      const resolved = resolveLocalIntervals(
        localDate,
        dayIntervals(schedule, localDate),
        schedule.timeZone,
      );
      annotations.push(
        ...resolved.annotations.map((annotation) => ({
          ...annotation,
          memberId: member.id,
          timeZone: schedule.timeZone,
        })),
      );
      intervals.push(
        ...resolved.intervals.filter(
          (item) =>
            item.endEpochMilliseconds > rangeStart &&
            item.startEpochMilliseconds < rangeEnd,
        ),
      );
    }
    return { memberId: member.id, intervals };
  });
  return {
    rangeStart,
    rangeEnd,
    schedules,
    segments: sweepOverlap(schedules, rangeStart, rangeEnd),
    annotations,
    skippedViewerDate: false,
  };
}

export function statusAtInstant(
  schedule: MemberInstantSchedule,
  epochMilliseconds: number,
): MemberStatus {
  return (
    schedule.intervals.find(
      (interval) =>
        interval.startEpochMilliseconds <= epochMilliseconds &&
        epochMilliseconds < interval.endEpochMilliseconds,
    )?.state ?? "unknown"
  );
}

export function selectedSegments(
  projection: BoardProjection,
  start: number,
  end: number,
): OverlapSegment[] {
  return projection.segments.filter(
    (segment) =>
      segment.endEpochMilliseconds > start &&
      segment.startEpochMilliseconds < end,
  );
}
