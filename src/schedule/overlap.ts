import type { MemberId, MemberStatus } from "../domain/types";
import type { InstantInterval } from "./timezone";

export interface MemberInstantSchedule {
  memberId: MemberId;
  intervals: InstantInterval[];
}

export interface OverlapSegment {
  startEpochMilliseconds: number;
  endEpochMilliseconds: number;
  freeMemberIds: MemberId[];
  busyMemberIds: MemberId[];
  unknownMemberIds: MemberId[];
  freeCount: number;
  totalCount: number;
  score: number;
}

function statusAt(
  intervals: readonly InstantInterval[],
  instant: number,
): MemberStatus {
  const match = intervals.find(
    (interval) =>
      interval.startEpochMilliseconds <= instant &&
      instant < interval.endEpochMilliseconds,
  );
  return match?.state ?? "unknown";
}

export function sweepOverlap(
  schedules: readonly MemberInstantSchedule[],
  rangeStart: number,
  rangeEnd: number,
): OverlapSegment[] {
  if (rangeEnd <= rangeStart) {
    throw new RangeError("range_invalid");
  }
  const boundaries = new Set<number>([rangeStart, rangeEnd]);
  for (const schedule of schedules) {
    for (const interval of schedule.intervals) {
      const start = Math.max(rangeStart, interval.startEpochMilliseconds);
      const end = Math.min(rangeEnd, interval.endEpochMilliseconds);
      if (end > start) {
        boundaries.add(start);
        boundaries.add(end);
      }
    }
  }
  const ordered = [...boundaries].sort((left, right) => left - right);
  const segments: OverlapSegment[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;
    const freeMemberIds: MemberId[] = [];
    const busyMemberIds: MemberId[] = [];
    const unknownMemberIds: MemberId[] = [];
    for (const schedule of schedules) {
      const status = statusAt(schedule.intervals, start);
      if (status === "free") freeMemberIds.push(schedule.memberId);
      else if (status === "busy") busyMemberIds.push(schedule.memberId);
      else unknownMemberIds.push(schedule.memberId);
    }
    const freeCount = freeMemberIds.length;
    segments.push({
      startEpochMilliseconds: start,
      endEpochMilliseconds: end,
      freeMemberIds,
      busyMemberIds,
      unknownMemberIds,
      freeCount,
      totalCount: schedules.length,
      score: schedules.length === 0 ? 0 : freeCount / schedules.length,
    });
  }
  return segments;
}

export function summarizeSelection(segments: readonly OverlapSegment[]): {
  minimum: number;
  maximum: number;
  total: number;
} {
  if (segments.length === 0) return { minimum: 0, maximum: 0, total: 0 };
  const counts = segments.map((segment) => segment.freeCount);
  return {
    minimum: Math.min(...counts),
    maximum: Math.max(...counts),
    total: segments[0]?.totalCount ?? 0,
  };
}
