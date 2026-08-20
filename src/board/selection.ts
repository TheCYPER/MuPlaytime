import { Temporal } from "@js-temporal/polyfill";
import type { RoomSnapshot } from "../domain/types";
import type { OverlapSegment } from "../schedule/overlap";
import {
  projectBoardDay,
  selectedSegments,
  type BoardProjection,
} from "./projection";

export const BOARD_STEP_MILLISECONDS = 30 * 60_000;
export const MAX_SELECTION_MINUTES = 1440;

export interface InstantRange {
  startEpochMilliseconds: number;
  endEpochMilliseconds: number;
}

export type InstantRangeError =
  "end_before_start" | "duration_step" | "duration_bounds";

export function validateInstantRange(
  range: InstantRange,
):
  | { valid: true; durationMinutes: number }
  | { valid: false; error: InstantRangeError } {
  const duration = range.endEpochMilliseconds - range.startEpochMilliseconds;
  if (duration <= 0) return { valid: false, error: "end_before_start" };
  if (duration % BOARD_STEP_MILLISECONDS !== 0)
    return { valid: false, error: "duration_step" };
  const durationMinutes = duration / 60_000;
  if (durationMinutes < 30 || durationMinutes > MAX_SELECTION_MINUTES)
    return { valid: false, error: "duration_bounds" };
  return { valid: true, durationMinutes };
}

export function initialBoardSelection(timeZone: string): InstantRange {
  const now = Temporal.Now.zonedDateTimeISO(timeZone);
  const localDate = now.toPlainDate();
  const start = localDate.toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from("18:00"),
  });
  return {
    startEpochMilliseconds: start.epochMilliseconds,
    endEpochMilliseconds: start.add({ hours: 2 }).epochMilliseconds,
  };
}

function intersectingViewerDates(
  range: InstantRange,
  viewerTimeZone: string,
): string[] {
  const start = Temporal.Instant.fromEpochMilliseconds(
    range.startEpochMilliseconds,
  )
    .toZonedDateTimeISO(viewerTimeZone)
    .toPlainDate();
  const end = Temporal.Instant.fromEpochMilliseconds(
    range.endEpochMilliseconds - 1,
  )
    .toZonedDateTimeISO(viewerTimeZone)
    .toPlainDate();
  const dates: string[] = [];
  let cursor = start;
  while (Temporal.PlainDate.compare(cursor, end) <= 0) {
    dates.push(cursor.toString());
    cursor = cursor.add({ days: 1 });
  }
  return dates;
}

export interface SelectionProjection extends BoardProjection {
  viewerDates: string[];
}

export function clippedSelectionSegments(
  projection: BoardProjection,
  range: InstantRange,
): OverlapSegment[] {
  return selectedSegments(
    projection,
    range.startEpochMilliseconds,
    range.endEpochMilliseconds,
  ).map((segment) => ({
    ...segment,
    startEpochMilliseconds: Math.max(
      range.startEpochMilliseconds,
      segment.startEpochMilliseconds,
    ),
    endEpochMilliseconds: Math.min(
      range.endEpochMilliseconds,
      segment.endEpochMilliseconds,
    ),
  }));
}

export function projectSelectionRange(
  snapshot: RoomSnapshot,
  range: InstantRange,
  viewerTimeZone: string,
  anchorViewerDate?: string,
): SelectionProjection {
  const dates = intersectingViewerDates(range, viewerTimeZone);
  if (anchorViewerDate && !dates.includes(anchorViewerDate)) {
    dates.push(anchorViewerDate);
    dates.sort((left, right) => Temporal.PlainDate.compare(left, right));
  }
  const projections = dates.map((date) =>
    projectBoardDay(snapshot, date, viewerTimeZone),
  );
  const first = projections[0];
  const last = projections.at(-1);
  if (!first || !last) throw new RangeError("selection_projection_empty");
  return {
    rangeStart: first.rangeStart,
    rangeEnd: last.rangeEnd,
    schedules: snapshot.members.map((member) => ({
      memberId: member.id,
      intervals: projections.flatMap((projection) =>
        (
          projection.schedules.find((item) => item.memberId === member.id)
            ?.intervals ?? []
        ).map((interval) => ({
          ...interval,
          startEpochMilliseconds: Math.max(
            projection.rangeStart,
            interval.startEpochMilliseconds,
          ),
          endEpochMilliseconds: Math.min(
            projection.rangeEnd,
            interval.endEpochMilliseconds,
          ),
        })),
      ),
    })),
    segments: projections.flatMap((projection) => projection.segments),
    annotations: projections.flatMap((projection) => projection.annotations),
    skippedViewerDate: projections.every(
      (projection) => projection.skippedViewerDate,
    ),
    viewerDates: dates,
  };
}
