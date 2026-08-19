import { Temporal } from "@js-temporal/polyfill";
import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { MemberId, RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { summarizeSelection } from "../schedule/overlap";
import { localProposalChoices } from "../schedule/timezone";
import { StatusLegend } from "../ui/StatusLegend";
import { projectBoardDay, selectedSegments } from "./projection";

const STEP = 30 * 60_000;

function localInput(epochMilliseconds: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function memberNames(ids: readonly MemberId[], snapshot: RoomSnapshot): string {
  return ids
    .map(
      (id) => snapshot.members.find((member) => member.id === id)?.displayName,
    )
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

export interface ProposedWindow {
  startEpochMilliseconds: number;
  endEpochMilliseconds: number;
  sourceTimeZone: string;
}

export function GroupBoard({
  snapshot,
  viewerTimeZone,
  onPropose,
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  onPropose: (window: ProposedWindow) => void;
}) {
  const { locale, t, formatDate } = useI18n();
  const [localDate, setLocalDate] = useState(() =>
    Temporal.Now.zonedDateTimeISO(viewerTimeZone).toPlainDate().toString(),
  );
  const projection = useMemo(
    () => projectBoardDay(snapshot, localDate, viewerTimeZone),
    [snapshot, localDate, viewerTimeZone],
  );
  const slotCount = Math.max(
    1,
    Math.round((projection.rangeEnd - projection.rangeStart) / STEP),
  );
  const [startSlot, setStartSlot] = useState(36);
  const [endSlot, setEndSlot] = useState(40);
  const safeStartSlot = Math.min(startSlot, slotCount - 1);
  const safeEndSlot = Math.max(safeStartSlot + 1, Math.min(endSlot, slotCount));
  const selectionStart = projection.rangeStart + safeStartSlot * STEP;
  const selectionEnd = projection.rangeStart + safeEndSlot * STEP;
  const selectionSegments = selectedSegments(
    projection,
    selectionStart,
    selectionEnd,
  );
  const summary = summarizeSelection(selectionSegments);
  const slotInstants = Array.from(
    { length: slotCount },
    (_, index) => projection.rangeStart + index * STEP,
  );
  const gridStyle = { "--slot-count": slotCount } as CSSProperties;

  function updateLocal(value: string, boundary: "start" | "end") {
    try {
      const choices = localProposalChoices(value, viewerTimeZone);
      const instant = choices[0]?.instant;
      if (!instant) return;
      const epoch = Temporal.Instant.from(instant).epochMilliseconds;
      const slot = Math.round((epoch - projection.rangeStart) / STEP);
      if (boundary === "start") setStartSlot(Math.min(slot, safeEndSlot - 1));
      else setEndSlot(Math.max(slot, safeStartSlot + 1));
    } catch {
      // Native datetime-local inputs are temporarily empty while being edited.
    }
  }

  function moveDay(delta: number) {
    const next = Temporal.PlainDate.from(localDate).add({ days: delta });
    if (next.year >= 1 && next.year <= 9999) setLocalDate(next.toString());
  }

  function setBoundaryFromPointer(
    event: PointerEvent<HTMLButtonElement>,
    boundary: "start" | "end",
  ) {
    const timeline = event.currentTarget.parentElement;
    if (!timeline) return;
    const rect = timeline.getBoundingClientRect();
    const slot = Math.round(
      ((event.clientX - rect.left) / rect.width) * slotCount,
    );
    if (boundary === "start")
      setStartSlot(Math.max(0, Math.min(slot, safeEndSlot - 1)));
    else setEndSlot(Math.min(slotCount, Math.max(slot, safeStartSlot + 1)));
  }

  function handlePointer(
    event: PointerEvent<HTMLButtonElement>,
    boundary: "start" | "end",
  ) {
    if (event.type === "pointerdown")
      event.currentTarget.setPointerCapture(event.pointerId);
    if (
      event.type === "pointermove" &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    setBoundaryFromPointer(event, boundary);
  }

  function handleBoundaryKey(
    event: KeyboardEvent<HTMLButtonElement>,
    boundary: "start" | "end",
  ) {
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? 1
          : 0;
    if (delta === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (boundary === "start") {
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? safeEndSlot - 1
            : safeStartSlot + delta;
      setStartSlot(Math.max(0, Math.min(next, safeEndSlot - 1)));
    } else {
      const next =
        event.key === "Home"
          ? safeStartSlot + 1
          : event.key === "End"
            ? slotCount
            : safeEndSlot + delta;
      setEndSlot(Math.min(slotCount, Math.max(next, safeStartSlot + 1)));
    }
  }

  if (projection.skippedViewerDate) {
    return (
      <section className="board-page" aria-labelledby="board-heading">
        <header className="view-heading">
          <div>
            <p className="eyebrow">{t("advisory")}</p>
            <h1 id="board-heading">{t("groupHeading")}</h1>
          </div>
        </header>
        <div className="day-controls">
          <button
            className="icon-button"
            type="button"
            onClick={() => moveDay(-1)}
            aria-label={t("previousDay")}
          >
            ←
          </button>
          <input
            aria-label={t("day")}
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={localDate}
            onChange={(event) => {
              if (event.target.value) setLocalDate(event.target.value);
            }}
          />
          <button
            className="icon-button"
            type="button"
            onClick={() => moveDay(1)}
            aria-label={t("nextDay")}
          >
            →
          </button>
        </div>
        <p className="empty-state" role="status">
          {t("skippedCivilDay")}
        </p>
      </section>
    );
  }

  return (
    <section className="board-page" aria-labelledby="board-heading">
      <header className="view-heading">
        <div>
          <p className="eyebrow">{t("advisory")}</p>
          <h1 id="board-heading">{t("groupHeading")}</h1>
        </div>
        <div className="day-controls">
          <button
            className="icon-button"
            type="button"
            onClick={() => moveDay(-1)}
            aria-label={t("previousDay")}
          >
            ←
          </button>
          <label className="field-inline">
            <span className="visually-hidden">{t("day")}</span>
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={localDate}
              onChange={(event) => {
                if (event.target.value) setLocalDate(event.target.value);
              }}
            />
          </label>
          <button
            className="icon-button"
            type="button"
            onClick={() => moveDay(1)}
            aria-label={t("nextDay")}
          >
            →
          </button>
        </div>
      </header>
      <StatusLegend />
      {projection.annotations.length > 0 && (
        <details className="dst-notes">
          <summary>
            {t("previewNotes")} · {projection.annotations.length}
          </summary>
          <ul>
            {projection.annotations.map((annotation, index) => {
              const member = snapshot.members.find(
                (item) => item.id === annotation.memberId,
              );
              return (
                <li
                  key={`${annotation.memberId}-${annotation.localDate}-${annotation.minute}-${annotation.kind}-${index}`}
                >
                  {member?.displayName} · {annotation.timeZone} ·{" "}
                  {annotation.localDate}{" "}
                  {String(Math.floor(annotation.minute / 60)).padStart(2, "0")}:
                  {String(annotation.minute % 60).padStart(2, "0")} ·{" "}
                  {annotation.kind === "skipped"
                    ? t("dstSkipped")
                    : t("dstRepeated")}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <div className="selection-toolbar">
        <div>
          <strong>{t("selectedWindow")}</strong>
          <span className="mono">
            {formatDate(selectionStart, {
              timeZone: viewerTimeZone,
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" – "}
            {formatDate(selectionEnd, {
              timeZone: viewerTimeZone,
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="overlap-summary">
            {t("minimum")} {summary.minimum}/{summary.total}
            {summary.maximum !== summary.minimum &&
              ` · ${t("range")} ${summary.minimum}–${summary.maximum}/${summary.total}`}
          </span>
        </div>
        <div className="selection-inputs">
          <label>
            <span>{t("start")}</span>
            <input
              type="datetime-local"
              min="0001-01-01T00:00"
              max="9999-12-31T23:59"
              value={localInput(selectionStart, viewerTimeZone)}
              onChange={(event) => updateLocal(event.target.value, "start")}
            />
          </label>
          <label>
            <span>{t("end")}</span>
            <input
              type="datetime-local"
              min="0001-01-01T00:00"
              max="9999-12-31T23:59"
              value={localInput(selectionEnd, viewerTimeZone)}
              onChange={(event) => updateLocal(event.target.value, "end")}
            />
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() =>
              onPropose({
                startEpochMilliseconds: selectionStart,
                endEpochMilliseconds: selectionEnd,
                sourceTimeZone: viewerTimeZone,
              })
            }
          >
            {t("proposeThisTime")}
          </button>
        </div>
      </div>

      <div
        className="loom-scroll"
        tabIndex={0}
        aria-label={`${t("groupHeading")} · ${viewerTimeZone}`}
      >
        <div className="loom-grid">
          <div className="loom-label loom-corner">{viewerTimeZone}</div>
          <div className="loom-timeline" style={gridStyle}>
            <div className="time-row loom-row" style={gridStyle}>
              {slotInstants.map((instant, index) => (
                <span className="time-cell mono" key={instant}>
                  {index % 4 === 0
                    ? formatDate(instant, {
                        timeZone: viewerTimeZone,
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : ""}
                </span>
              ))}
            </div>
            <div
              className="shuttle"
              style={{
                left: `${(safeStartSlot / slotCount) * 100}%`,
                width: `${((safeEndSlot - safeStartSlot) / slotCount) * 100}%`,
              }}
              aria-hidden="true"
            />
            <button
              className="shuttle-handle shuttle-start"
              type="button"
              role="slider"
              style={{
                left: `calc(${(safeStartSlot / slotCount) * 100}% - 22px)`,
              }}
              aria-valuemin={0}
              aria-valuemax={slotCount - 1}
              aria-valuenow={safeStartSlot}
              aria-label={`${t("selectedWindow")} ${t("start")}`}
              aria-valuetext={localInput(selectionStart, viewerTimeZone)}
              onKeyDown={(event) => handleBoundaryKey(event, "start")}
              onPointerDown={(event) => handlePointer(event, "start")}
              onPointerMove={(event) => handlePointer(event, "start")}
            >
              <span aria-hidden="true">↤</span>
            </button>
            <button
              className="shuttle-handle shuttle-end"
              type="button"
              role="slider"
              style={{
                left: `calc(${(safeEndSlot / slotCount) * 100}% - 22px)`,
              }}
              aria-valuemin={1}
              aria-valuemax={slotCount}
              aria-valuenow={safeEndSlot}
              aria-label={`${t("selectedWindow")} ${t("end")}`}
              aria-valuetext={localInput(selectionEnd, viewerTimeZone)}
              onKeyDown={(event) => handleBoundaryKey(event, "end")}
              onPointerDown={(event) => handlePointer(event, "end")}
              onPointerMove={(event) => handlePointer(event, "end")}
            >
              <span aria-hidden="true">↦</span>
            </button>
          </div>

          <div className="loom-label overlap-label">∑</div>
          <div
            className="loom-timeline overlap-row exact-row"
            style={gridStyle}
          >
            {projection.segments.map((segment) => {
              const count = segment.freeCount;
              const total = segment.totalCount;
              const left =
                ((segment.startEpochMilliseconds - projection.rangeStart) /
                  (projection.rangeEnd - projection.rangeStart)) *
                100;
              const width =
                ((segment.endEpochMilliseconds -
                  segment.startEpochMilliseconds) /
                  (projection.rangeEnd - projection.rangeStart)) *
                100;
              return (
                <button
                  className="overlap-cell exact-segment"
                  style={
                    {
                      "--overlap": total === 0 ? 0 : count / total,
                      left: `${left}%`,
                      width: `${width}%`,
                    } as CSSProperties
                  }
                  key={segment.startEpochMilliseconds}
                  type="button"
                  title={`${count}/${total} ${t("markedFree")}`}
                  onClick={() => {
                    const slot = Math.floor(
                      (segment.startEpochMilliseconds - projection.rangeStart) /
                        STEP,
                    );
                    setStartSlot(slot);
                    setEndSlot(Math.min(slot + 2, slotCount));
                  }}
                >
                  {count}/{total}
                </button>
              );
            })}
          </div>

          {snapshot.members.map((member) => {
            const schedule = projection.schedules.find(
              (item) => item.memberId === member.id,
            );
            const anchor = snapshot.schedules.find(
              (item) => item.memberId === member.id,
            )?.timeZone;
            return (
              <div className="loom-member" key={member.id} role="row">
                <div className="loom-label member-label">
                  <strong>{member.displayName}</strong>
                  {anchor && <small>{anchor}</small>}
                </div>
                <div
                  className="loom-timeline member-row exact-row status-unknown"
                  style={gridStyle}
                  role="grid"
                >
                  {schedule?.intervals.map((interval) => {
                    const start = Math.max(
                      interval.startEpochMilliseconds,
                      projection.rangeStart,
                    );
                    const end = Math.min(
                      interval.endEpochMilliseconds,
                      projection.rangeEnd,
                    );
                    if (end <= start) return null;
                    const left =
                      ((start - projection.rangeStart) /
                        (projection.rangeEnd - projection.rangeStart)) *
                      100;
                    const width =
                      ((end - start) /
                        (projection.rangeEnd - projection.rangeStart)) *
                      100;
                    const label = `${member.displayName}, ${formatDate(start, { timeZone: viewerTimeZone, hour: "2-digit", minute: "2-digit" })}–${formatDate(end, { timeZone: viewerTimeZone, hour: "2-digit", minute: "2-digit" })}, ${t(interval.state)}`;
                    return (
                      <span
                        role="gridcell"
                        aria-label={label}
                        title={label}
                        className={`schedule-cell exact-segment status-${interval.state}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        key={`${start}-${end}-${interval.state}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="selection-details">
        <summary>
          {t("selectedWindow")} · {summary.minimum}–{summary.maximum}/
          {summary.total}
        </summary>
        <ol>
          {selectionSegments.map((segment) => (
            <li key={segment.startEpochMilliseconds}>
              <strong className="mono">
                {formatDate(segment.startEpochMilliseconds, {
                  timeZone: viewerTimeZone,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
              <span>
                {t("whoIsFree")}:{" "}
                {memberNames(segment.freeMemberIds, snapshot) || "—"}
              </span>
              <span>
                {t("whoIsBusy")}:{" "}
                {memberNames(segment.busyMemberIds, snapshot) || "—"}
              </span>
              <span>
                {t("whoIsUnknown")}:{" "}
                {memberNames(segment.unknownMemberIds, snapshot) || "—"}
              </span>
            </li>
          ))}
        </ol>
      </details>
      <p className="visually-hidden" lang={locale}>
        {t("advisory")}
      </p>
    </section>
  );
}
