import { Temporal } from "@js-temporal/polyfill";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { RoomSnapshot } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { summarizeSelection } from "../schedule/overlap";
import {
  localProposalChoices,
  type LocalInstantChoice,
} from "../schedule/timezone";
import { StatusLegend } from "../ui/StatusLegend";
import type { BoardTimeChoiceContext } from "./BoardTimeChoiceSheet";
import {
  BOARD_STEP_MILLISECONDS,
  clippedSelectionSegments,
  initialBoardSelection,
  projectSelectionRange,
  validateInstantRange,
  type InstantRange,
} from "./selection";

function localInput(epochMilliseconds: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function nearbyTimes(local: string, zone: string): string[] {
  try {
    const plain = Temporal.PlainDateTime.from(local);
    return [-60, -30, 30, 60]
      .map((minutes) =>
        plain.add({ minutes }).toString({ smallestUnit: "minute" }),
      )
      .filter((candidate) => localProposalChoices(candidate, zone).length > 0);
  } catch {
    return [];
  }
}

function BoundaryField({
  boundary,
  range,
  viewerTimeZone,
  onRange,
  onResolutionChange,
}: {
  boundary: "start" | "end";
  range: InstantRange;
  viewerTimeZone: string;
  onRange: (range: InstantRange) => void;
  onResolutionChange: (boundary: "start" | "end", unresolved: boolean) => void;
}) {
  const { t } = useI18n();
  const epoch =
    boundary === "start"
      ? range.startEpochMilliseconds
      : range.endEpochMilliseconds;
  const savedValue = localInput(epoch, viewerTimeZone);
  const [draft, setDraft] = useState(savedValue);
  const [choices, setChoices] = useState<LocalInstantChoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onResolutionChange(boundary, false);
  }, [boundary, onResolutionChange, savedValue]);

  function choose(choice: LocalInstantChoice) {
    const candidateEpoch = Temporal.Instant.from(
      choice.instant,
    ).epochMilliseconds;
    const candidate =
      boundary === "start"
        ? { ...range, startEpochMilliseconds: candidateEpoch }
        : { ...range, endEpochMilliseconds: candidateEpoch };
    if (!validateInstantRange(candidate).valid) {
      setError(t("selectionInvalid"));
      onResolutionChange(boundary, true);
      return;
    }
    setError(null);
    setChoices([]);
    onResolutionChange(boundary, false);
    onRange(candidate);
  }

  function update(value: string) {
    setDraft(value);
    setError(null);
    if (value === savedValue) {
      setChoices([]);
      onResolutionChange(boundary, false);
      return;
    }
    try {
      const nextChoices = localProposalChoices(value, viewerTimeZone);
      setChoices(nextChoices);
      if (nextChoices.length === 1 && nextChoices[0]) choose(nextChoices[0]);
      else onResolutionChange(boundary, true);
    } catch {
      setChoices([]);
      onResolutionChange(boundary, true);
    }
  }

  return (
    <div className="boundary-field">
      <label>
        <span>{t(boundary)}</span>
        <input
          type="datetime-local"
          min="0001-01-01T00:00"
          max="9999-12-31T23:59"
          value={draft}
          onChange={(event) => update(event.target.value)}
        />
      </label>
      {choices.length > 1 && (
        <fieldset className="offset-choices boundary-choices">
          <legend>{t("ambiguousTime")}</legend>
          {choices.map((choice) => (
            <label key={choice.instant}>
              <input
                type="radio"
                name={`board-${boundary}-choice`}
                onChange={() => choose(choice)}
              />
              {t("offsetChoice")}: {choice.offset}
            </label>
          ))}
        </fieldset>
      )}
      {draft && choices.length === 0 && draft !== savedValue && (
        <div className="gap-warning" role="alert">
          <p>{t("nonexistentTime")}</p>
          {nearbyTimes(draft, viewerTimeZone).map((candidate) => (
            <button
              className="text-button"
              type="button"
              key={candidate}
              onClick={() => update(candidate)}
            >
              {candidate.replace("T", " ")}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface ProposedWindow {
  startEpochMilliseconds: number;
  endEpochMilliseconds: number;
  sourceTimeZone: string;
}

export interface SelectionDetailContext {
  range: InstantRange;
  viewerTimeZone: string;
}

export function GroupBoard({
  snapshot,
  viewerTimeZone,
  onPropose,
  onViewDetails,
  onChooseDayTime,
}: {
  snapshot: RoomSnapshot;
  viewerTimeZone: string;
  onPropose: (window: ProposedWindow) => void;
  onViewDetails: (context: SelectionDetailContext) => void;
  onChooseDayTime: (context: BoardTimeChoiceContext) => void;
}) {
  const { locale, t, formatDate } = useI18n();
  const [selection, setSelection] = useState<InstantRange>(() =>
    initialBoardSelection(viewerTimeZone),
  );
  const localDate = Temporal.Instant.fromEpochMilliseconds(
    selection.startEpochMilliseconds,
  )
    .toZonedDateTimeISO(viewerTimeZone)
    .toPlainDate()
    .toString();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [boundaryDraftState, setBoundaryDraftState] = useState({
    viewerTimeZone,
    start: false,
    end: false,
    zoneResetNotice: false,
  });
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    boundary: "start" | "end";
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const pendingBoundaryRef = useRef<{
    boundary: "start" | "end";
    epochMilliseconds: number;
  } | null>(null);
  const boundaryFrameRef = useRef<number | null>(null);
  const tapRef = useRef<{ x: number; y: number } | null>(null);

  const projection = useMemo(
    () => projectSelectionRange(snapshot, selection, viewerTimeZone, localDate),
    [snapshot, selection, viewerTimeZone, localDate],
  );
  const slotCount = Math.max(
    1,
    Math.round(
      (projection.rangeEnd - projection.rangeStart) / BOARD_STEP_MILLISECONDS,
    ),
  );
  const startSlot =
    (selection.startEpochMilliseconds - projection.rangeStart) /
    BOARD_STEP_MILLISECONDS;
  const endSlot =
    (selection.endEpochMilliseconds - projection.rangeStart) /
    BOARD_STEP_MILLISECONDS;
  const selectionSegments = clippedSelectionSegments(projection, selection);
  const summary = summarizeSelection(selectionSegments);
  const slotInstants = Array.from(
    { length: slotCount },
    (_, index) => projection.rangeStart + index * BOARD_STEP_MILLISECONDS,
  );
  const gridStyle = { "--slot-count": slotCount } as CSSProperties;
  const handoffBlocked =
    boundaryDraftState.viewerTimeZone === viewerTimeZone &&
    (boundaryDraftState.start || boundaryDraftState.end);
  const setBoundaryResolution = useCallback(
    (boundary: "start" | "end", unresolved: boolean) => {
      setBoundaryDraftState((current) => {
        const zoneChanged = current.viewerTimeZone !== viewerTimeZone;
        const base = zoneChanged
          ? {
              viewerTimeZone,
              start: false,
              end: false,
              zoneResetNotice: current.start || current.end,
            }
          : current;
        if (
          base[boundary] === unresolved &&
          (!unresolved || !base.zoneResetNotice)
        )
          return base;
        return {
          ...base,
          [boundary]: unresolved,
          zoneResetNotice: unresolved ? false : base.zoneResetNotice,
        };
      });
    },
    [viewerTimeZone],
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || dragRef.current) return;
    const ratio =
      (selection.startEpochMilliseconds - projection.rangeStart) /
      Math.max(1, projection.rangeEnd - projection.rangeStart);
    rail.scrollLeft = Math.max(
      0,
      ratio * rail.scrollWidth - rail.clientWidth / 3,
    );
  }, [
    localDate,
    viewerTimeZone,
    projection.rangeStart,
    projection.rangeEnd,
    selection.startEpochMilliseconds,
  ]);

  useEffect(
    () => () => {
      if (boundaryFrameRef.current !== null)
        cancelAnimationFrame(boundaryFrameRef.current);
    },
    [],
  );

  function commitRange(candidate: InstantRange): boolean {
    if (!validateInstantRange(candidate).valid) {
      setSelectionError(t("selectionInvalid"));
      return false;
    }
    setSelectionError(null);
    setBoundaryDraftState((current) => ({
      ...current,
      viewerTimeZone,
      zoneResetNotice: false,
    }));
    setSelection(candidate);
    return true;
  }

  function chooseRebased(choice: LocalInstantChoice) {
    const start = Temporal.Instant.from(choice.instant).epochMilliseconds;
    const duration =
      selection.endEpochMilliseconds - selection.startEpochMilliseconds;
    if (
      commitRange({
        startEpochMilliseconds: start,
        endEpochMilliseconds: start + duration,
      })
    )
      setBoundaryDraftState({
        viewerTimeZone,
        start: false,
        end: false,
        zoneResetNotice: false,
      });
  }

  function resolveDayLocal(local: string) {
    const choices = localProposalChoices(local, viewerTimeZone);
    if (choices.length === 1 && choices[0]) chooseRebased(choices[0]);
    else
      onChooseDayTime({
        issue: choices.length > 1 ? "ambiguous" : "nonexistent",
        viewerTimeZone,
        choices:
          choices.length > 1
            ? choices
            : nearbyTimes(local, viewerTimeZone).flatMap((candidate) =>
                localProposalChoices(candidate, viewerTimeZone),
              ),
        onChoose: chooseRebased,
      });
  }

  function moveDay(delta: number) {
    const current = Temporal.Instant.fromEpochMilliseconds(
      selection.startEpochMilliseconds,
    ).toZonedDateTimeISO(viewerTimeZone);
    const targetDate = current.toPlainDate().add({ days: delta });
    if (targetDate.year < 1 || targetDate.year > 9999) return;
    resolveDayLocal(
      targetDate
        .toPlainDateTime(current.toPlainTime())
        .toString({ smallestUnit: "minute" }),
    );
  }

  function slotFromPointer(event: PointerEvent<HTMLElement>): number {
    const timeline = event.currentTarget.parentElement;
    if (!timeline) return 0;
    const rect = timeline.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        slotCount,
        Math.round(((event.clientX - rect.left) / rect.width) * slotCount),
      ),
    );
  }

  function boundaryEpoch(event: PointerEvent<HTMLButtonElement>): number {
    const slot = slotFromPointer(event);
    return projection.rangeStart + slot * BOARD_STEP_MILLISECONDS;
  }

  function flushBoundaryFrame() {
    if (boundaryFrameRef.current !== null)
      cancelAnimationFrame(boundaryFrameRef.current);
    boundaryFrameRef.current = null;
    const pending = pendingBoundaryRef.current;
    pendingBoundaryRef.current = null;
    if (!pending) return;
    setSelection((current) => {
      const candidate =
        pending.boundary === "start"
          ? {
              ...current,
              startEpochMilliseconds: pending.epochMilliseconds,
            }
          : { ...current, endEpochMilliseconds: pending.epochMilliseconds };
      if (!validateInstantRange(candidate).valid) {
        setSelectionError(t("selectionInvalid"));
        return current;
      }
      setSelectionError(null);
      setBoundaryResolution(pending.boundary, false);
      return candidate;
    });
  }

  function scheduleBoundary(
    event: PointerEvent<HTMLButtonElement>,
    boundary: "start" | "end",
  ) {
    pendingBoundaryRef.current = {
      boundary,
      epochMilliseconds: boundaryEpoch(event),
    };
    if (boundaryFrameRef.current === null)
      boundaryFrameRef.current = requestAnimationFrame(flushBoundaryFrame);
  }

  function handlePointer(
    event: PointerEvent<HTMLButtonElement>,
    boundary: "start" | "end",
  ) {
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        boundary,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    } else if (
      event.type === "pointermove" &&
      dragRef.current?.pointerId === event.pointerId
    ) {
      if (
        !dragRef.current.moved &&
        Math.hypot(
          event.clientX - dragRef.current.startX,
          event.clientY - dragRef.current.startY,
        ) < 6
      )
        return;
      dragRef.current.moved = true;
      scheduleBoundary(event, boundary);
    }
  }

  function endPointer(event: PointerEvent<HTMLButtonElement>) {
    flushBoundaryFrame();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  function handleBoundaryKey(
    event: KeyboardEvent<HTMLButtonElement>,
    boundary: "start" | "end",
  ) {
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -BOARD_STEP_MILLISECONDS
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? BOARD_STEP_MILLISECONDS
          : 0;
    if (delta === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (boundary === "start") {
      const epoch =
        event.key === "Home"
          ? projection.rangeStart
          : event.key === "End"
            ? selection.endEpochMilliseconds - BOARD_STEP_MILLISECONDS
            : selection.startEpochMilliseconds + delta;
      if (commitRange({ ...selection, startEpochMilliseconds: epoch }))
        setBoundaryResolution("start", false);
    } else {
      const epoch =
        event.key === "Home"
          ? selection.startEpochMilliseconds + BOARD_STEP_MILLISECONDS
          : event.key === "End"
            ? projection.rangeEnd
            : selection.endEpochMilliseconds + delta;
      if (commitRange({ ...selection, endEpochMilliseconds: epoch }))
        setBoundaryResolution("end", false);
    }
  }

  function propose() {
    if (handoffBlocked) {
      setSelectionError(t("selectionInvalid"));
      return;
    }
    if (!validateInstantRange(selection).valid) {
      setSelectionError(t("selectionInvalid"));
      return;
    }
    onPropose({ ...selection, sourceTimeZone: viewerTimeZone });
  }

  if (projection.skippedViewerDate) {
    return (
      <section className="board-page" aria-labelledby="board-heading">
        <header className="view-heading">
          <div>
            <p className="eyebrow">{t("advisory")}</p>
            <h1 id="board-heading" tabIndex={-1}>
              {t("groupHeading")}
            </h1>
          </div>
        </header>
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
          <h1 id="board-heading" tabIndex={-1}>
            {t("groupHeading")}
          </h1>
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
                if (!event.target.value) return;
                const time = Temporal.Instant.fromEpochMilliseconds(
                  selection.startEpochMilliseconds,
                )
                  .toZonedDateTimeISO(viewerTimeZone)
                  .toPlainTime();
                resolveDayLocal(
                  Temporal.PlainDate.from(event.target.value)
                    .toPlainDateTime(time)
                    .toString({ smallestUnit: "minute" }),
                );
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
      <div className="selection-fields">
        <BoundaryField
          key={`start-${selection.startEpochMilliseconds}-${viewerTimeZone}`}
          boundary="start"
          range={selection}
          viewerTimeZone={viewerTimeZone}
          onRange={commitRange}
          onResolutionChange={setBoundaryResolution}
        />
        <BoundaryField
          key={`end-${selection.endEpochMilliseconds}-${viewerTimeZone}`}
          boundary="end"
          range={selection}
          viewerTimeZone={viewerTimeZone}
          onRange={commitRange}
          onResolutionChange={setBoundaryResolution}
        />
      </div>
      {selectionError && (
        <p className="form-error" role="alert">
          {selectionError}
        </p>
      )}
      {!selectionError && boundaryDraftState.zoneResetNotice && (
        <p className="form-error" role="alert">
          {t("selectionDraftResetForZone")}
        </p>
      )}
      <div className="rail-navigation">
        <button
          className="icon-button"
          type="button"
          aria-label={t("previousBlock")}
          onClick={() => {
            const rail = railRef.current;
            if (rail)
              rail.scrollBy({ left: -rail.clientWidth, behavior: "smooth" });
          }}
        >
          ←
        </button>
        <span className="mono">
          {projection.viewerDates.join(" → ")} · {viewerTimeZone}
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label={t("nextBlock")}
          onClick={() => {
            const rail = railRef.current;
            if (rail)
              rail.scrollBy({ left: rail.clientWidth, behavior: "smooth" });
          }}
        >
          →
        </button>
      </div>
      <div
        ref={railRef}
        className="loom-scroll"
        data-intentional-horizontal-scroll
        tabIndex={0}
        aria-label={`${t("groupHeading")} · ${viewerTimeZone}`}
      >
        <div
          className="loom-grid"
          style={
            { "--viewer-days": projection.viewerDates.length } as CSSProperties
          }
        >
          <div className="loom-label loom-corner">{viewerTimeZone}</div>
          <div className="loom-timeline" style={gridStyle}>
            <div className="time-row loom-row" style={gridStyle}>
              {slotInstants.map((instant, index) => {
                const zoned =
                  Temporal.Instant.fromEpochMilliseconds(
                    instant,
                  ).toZonedDateTimeISO(viewerTimeZone);
                const dateDivider =
                  index > 0 && zoned.hour === 0 && zoned.minute === 0;
                return (
                  <span
                    className={`time-cell mono${dateDivider ? " date-divider" : ""}`}
                    key={instant}
                  >
                    {index % 8 === 0
                      ? formatDate(instant, {
                          timeZone: viewerTimeZone,
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : ""}
                    {dateDivider && (
                      <small>{zoned.toPlainDate().toString()}</small>
                    )}
                  </span>
                );
              })}
            </div>
            <div
              className="shuttle"
              style={{
                left: `${(startSlot / slotCount) * 100}%`,
                width: `${((endSlot - startSlot) / slotCount) * 100}%`,
              }}
              aria-hidden="true"
            />
            {(["start", "end"] as const).map((boundary) => {
              const slot = boundary === "start" ? startSlot : endSlot;
              const epoch =
                boundary === "start"
                  ? selection.startEpochMilliseconds
                  : selection.endEpochMilliseconds;
              return (
                <button
                  className={`shuttle-handle shuttle-${boundary}`}
                  type="button"
                  role="slider"
                  key={boundary}
                  style={{
                    left: `calc(${(slot / slotCount) * 100}% - 22px)`,
                  }}
                  aria-valuemin={boundary === "start" ? 0 : 1}
                  aria-valuemax={
                    boundary === "start" ? slotCount - 1 : slotCount
                  }
                  aria-valuenow={Math.round(slot)}
                  aria-label={`${t("selectedWindow")} ${t(boundary)}`}
                  aria-valuetext={localInput(epoch, viewerTimeZone)}
                  onKeyDown={(event) => handleBoundaryKey(event, boundary)}
                  onPointerDown={(event) => handlePointer(event, boundary)}
                  onPointerMove={(event) => handlePointer(event, boundary)}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  onLostPointerCapture={() => {
                    if (boundaryFrameRef.current !== null)
                      cancelAnimationFrame(boundaryFrameRef.current);
                    boundaryFrameRef.current = null;
                    pendingBoundaryRef.current = null;
                    dragRef.current = null;
                  }}
                >
                  <span aria-hidden="true">
                    {boundary === "start" ? "↤" : "↦"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="loom-label overlap-label">∑</div>
          <div
            className="loom-timeline overlap-row exact-row"
            style={gridStyle}
          >
            {projection.segments.map((segment) => {
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
                <span
                  className="overlap-cell exact-segment"
                  style={
                    {
                      "--overlap":
                        segment.totalCount === 0
                          ? 0
                          : segment.freeCount / segment.totalCount,
                      left: `${left}%`,
                      width: `${width}%`,
                    } as CSSProperties
                  }
                  key={segment.startEpochMilliseconds}
                  title={`${segment.freeCount}/${segment.totalCount} ${t("markedFree")}`}
                >
                  <span className="visually-hidden">
                    {segment.freeCount}/{segment.totalCount}
                  </span>
                </span>
              );
            })}
            <button
              className="overlap-hit-layer"
              type="button"
              aria-label={t("viewDetails")}
              onClick={(event) => {
                if (event.detail === 0 && !handoffBlocked) {
                  onViewDetails({ range: selection, viewerTimeZone });
                }
              }}
              onPointerDown={(event) => {
                tapRef.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => {
                const started = tapRef.current;
                tapRef.current = null;
                if (
                  !started ||
                  Math.hypot(
                    event.clientX - started.x,
                    event.clientY - started.y,
                  ) >= 8
                )
                  return;
                const slot = Math.min(slotCount - 1, slotFromPointer(event));
                const start =
                  projection.rangeStart + slot * BOARD_STEP_MILLISECONDS;
                const range = {
                  startEpochMilliseconds: start,
                  endEpochMilliseconds: start + BOARD_STEP_MILLISECONDS,
                };
                if (validateInstantRange(range).valid) {
                  commitRange(range);
                  onViewDetails({ range, viewerTimeZone });
                }
              }}
              onPointerCancel={() => {
                tapRef.current = null;
              }}
            />
          </div>
          {snapshot.members.map((member) => {
            const schedule = projection.schedules.find(
              (item) => item.memberId === member.id,
            );
            const anchor = snapshot.schedules.find(
              (item) => item.memberId === member.id,
            )?.timeZone;
            return (
              <div className="loom-member" key={member.id}>
                <div className="loom-label member-label">
                  <strong title={member.displayName}>
                    {member.displayName}
                  </strong>
                  {anchor && <small>{anchor}</small>}
                </div>
                <div
                  className="loom-timeline member-row exact-row status-unknown"
                  style={gridStyle}
                  role="group"
                  aria-label={member.displayName}
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
                        role="img"
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
      <div className="selection-dock">
        <div>
          <strong className="mono">
            {formatDate(selection.startEpochMilliseconds, {
              timeZone: viewerTimeZone,
              hour: "2-digit",
              minute: "2-digit",
            })}
            –
            {formatDate(selection.endEpochMilliseconds, {
              timeZone: viewerTimeZone,
              hour: "2-digit",
              minute: "2-digit",
            })}
          </strong>
          <span>
            {t("minimum")} {summary.minimum}/{summary.total}
            {summary.maximum !== summary.minimum &&
              ` · ${t("range")} ${summary.minimum}–${summary.maximum}/${summary.total}`}
          </span>
        </div>
        <div>
          <button
            className="button button-secondary"
            type="button"
            disabled={handoffBlocked}
            onClick={() => onViewDetails({ range: selection, viewerTimeZone })}
          >
            {t("viewDetails")}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={handoffBlocked}
            onClick={propose}
          >
            {t("proposeThisTime")}
          </button>
        </div>
      </div>
      <p className="visually-hidden" lang={locale}>
        {t("advisory")}
      </p>
    </section>
  );
}
