import { Temporal } from "@js-temporal/polyfill";
import type { MemberId, RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { summarizeSelection } from "../schedule/overlap";
import {
  clippedSelectionSegments,
  projectSelectionRange,
  type InstantRange,
} from "./selection";

function names(ids: readonly MemberId[], snapshot: RoomSnapshot): string {
  return ids
    .map(
      (id) => snapshot.members.find((member) => member.id === id)?.displayName,
    )
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

function memberLocalRange(
  memberId: MemberId,
  snapshot: RoomSnapshot,
  start: number,
  end: number,
): string | null {
  const zone = snapshot.schedules.find(
    (schedule) => schedule.memberId === memberId,
  )?.timeZone;
  if (!zone) return null;
  const format = (epoch: number) =>
    Temporal.Instant.fromEpochMilliseconds(epoch)
      .toZonedDateTimeISO(zone)
      .toPlainDateTime()
      .toString({ smallestUnit: "minute" });
  return `${format(start)}–${format(end)} · ${zone}`;
}

export function SelectionDetailSheet({
  snapshot,
  range,
  viewerTimeZone,
}: {
  snapshot: RoomSnapshot;
  range: InstantRange;
  viewerTimeZone: string;
}) {
  const { t, formatDate } = useI18n();
  const projection = projectSelectionRange(snapshot, range, viewerTimeZone);
  const segments = clippedSelectionSegments(projection, range);
  const summary = summarizeSelection(segments);
  return (
    <div className="selection-detail-content">
      <p
        className="selection-detail-range mono"
        data-dialog-initial-focus
        tabIndex={-1}
      >
        {formatDate(range.startEpochMilliseconds, {
          timeZone: viewerTimeZone,
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {" – "}
        {formatDate(range.endEpochMilliseconds, {
          timeZone: viewerTimeZone,
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        <small>{viewerTimeZone}</small>
      </p>
      <p className="overlap-summary">
        {t("minimum")} {summary.minimum}/{summary.total}
        {summary.maximum !== summary.minimum &&
          ` · ${t("range")} ${summary.minimum}–${summary.maximum}/${summary.total}`}
      </p>
      <ol className="selection-segment-list">
        {segments.map((segment) => (
          <li key={segment.startEpochMilliseconds}>
            <strong className="mono">
              {formatDate(segment.startEpochMilliseconds, {
                timeZone: viewerTimeZone,
                hour: "2-digit",
                minute: "2-digit",
              })}
              –
              {formatDate(segment.endEpochMilliseconds, {
                timeZone: viewerTimeZone,
                hour: "2-digit",
                minute: "2-digit",
              })}
              {` · ${segment.freeCount}/${segment.totalCount}`}
            </strong>
            <span>
              {t("whoIsFree")}: {names(segment.freeMemberIds, snapshot) || "—"}
            </span>
            <span>
              {t("whoIsBusy")}: {names(segment.busyMemberIds, snapshot) || "—"}
            </span>
            <span>
              {t("whoIsUnknown")}:{" "}
              {names(segment.unknownMemberIds, snapshot) || "—"}
            </span>
            {[
              ...segment.freeMemberIds,
              ...segment.busyMemberIds,
              ...segment.unknownMemberIds,
            ].map((memberId) => {
              const member = snapshot.members.find(
                (item) => item.id === memberId,
              );
              const local = memberLocalRange(
                memberId,
                snapshot,
                segment.startEpochMilliseconds,
                segment.endEpochMilliseconds,
              );
              return local ? (
                <small key={memberId}>
                  {member?.displayName} · {local}
                </small>
              ) : null;
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
