# Frontend Data and Time Contracts

> Executable boundaries for Supabase server state, runtime decoding, persisted
> browser state, and civil-time projection.

## Scenario: Consume and mutate room data across time zones

### 1. Scope / Trigger

Use this contract whenever code reads or mutates a room snapshot, subscribes to
room changes, persists browser state, accepts a time-zone identifier, or converts
between a civil time and an instant. These are cross-layer boundaries: TypeScript
types alone are not sufficient.

### 2. Signatures

The public environment contract is:

```text
VITE_SUPABASE_URL: absolute URL, required
VITE_SUPABASE_PUBLISHABLE_KEY: browser-safe key, at least 20 characters, required
VITE_SCHEMA_VERSION: non-empty string, defaults to 2026081801
VITE_NORMALIZATION_VERSION: exact deployed ICU marker, required
```

Server state uses one canonical key and one snapshot RPC:

```ts
roomKeys.snapshot(roomId); // ["room", roomId, "snapshot"]
repository.snapshot(roomId): Promise<RoomSnapshot>;
invalidateRoom(queryClient, roomId): Promise<void>;
executeRoomMutation({ onlineAtSubmit, operation }): Promise<unknown>;
projectSelectionRange(snapshot, absoluteRange, viewerTimeZone): SelectionProjection;
```

All mutations go through `RoomRepository`. Schedule writes include the current
`expectedVersion`; proposal choices use this concrete source tuple:

```ts
interface ConcreteOptionInput {
  startsAt: string; // absolute instant
  durationMinutes: number;
  sourceTimeZone: string; // named zone
  sourceLocalStart: string; // wall-clock timestamp
  sourceOffset: string; // Z or signed HH:MM
}
```

Time conversion is centralized in:

```ts
isNamedIanaTimeZone(zone): boolean;
resolveLocalIntervals(localDate, intervals, zone): ResolvedDay;
localProposalChoices(localDateTime, zone): LocalInstantChoice[];
projectInstant(instant, zone): Temporal.ZonedDateTime;
```

### 3. Contracts

- `loadPublicConfig()` validates public configuration with Zod. It returns
  `null`, rather than a partial configuration, when any required value is bad.
- App boot creates or restores an anonymous Supabase session, then requires exact
  equality between bundle and database `schema_version` and
  `normalization_version`. A mismatch stops room rendering.
- `RoomRepository` is the only browser RPC adapter. It maps camelCase inputs to
  `p_snake_case` RPC arguments, preserves Supabase errors as `RoomRpcError`, and
  Zod-parses every successful response before mapping snake_case rows to domain
  types.
- TanStack Query owns snapshots. Mutations do not optimistically patch them;
  `onSettled` invalidates `roomKeys.all(roomId)`. Realtime `INSERT` events,
  reconnects, visible-tab recovery, and successful subscription also invalidate
  the room. A successful subscription performs one bounded follow-up
  reconciliation after transport warmup so the first event cannot fall into a
  self-hosted/hosted replication startup gap. The event is a freshness signal,
  not domain data.
- Non-idempotent room mutations use TanStack `networkMode: "always"` so an
  offline submission fails immediately instead of pausing for automatic replay.
  The submit path checks current connectivity at the event boundary and again
  immediately before invoking the repository operation. Draft controls remain
  editable offline; only the write action is disabled/guarded.
- A schedule draft that outlives a snapshot render captures its opened
  `baseVersion` and canonical base interval set. If Realtime/refetch supplies a
  newer version, retain the user's fields/operation log, disable Save, render
  current canonical output versus intended rebased output, and bind deliberate
  review to that exact latest version. Never silently adopt the latest version
  in an old draft callback.
- Multi-date board projections keep the absolute selection as authority and
  clip every member interval to each projected viewer day's
  `[rangeStart, rangeEnd)` before concatenating days. This prevents a source
  interval crossing viewer midnight from appearing twice.
- `muplaytime.preferences.v1` may contain only `lastRoomId`, `lastMemberId`,
  `viewerTimeZone`, and `lastView`. A raw invite capability remains in the join
  hash only until claim, then in React tab memory; it must never enter preferences,
  `localStorage`, or `sessionStorage`. Supabase auth alone uses
  `muplaytime.auth.v1`.
- A time-zone identity must be a Temporal-resolvable named zone. Numeric offsets
  such as `+04`, `+0400`, and `+04:00` are not identities. Civil schedule ranges
  are half-open minute intervals: `0 <= startMinute < endMinute <= 1440`.
- `resolveLocalIntervals` omits nonexistent spring-forward minutes and annotates
  them as `skipped`; it materializes both fall-back instants and annotates them as
  `repeated`. `1440` means midnight at the start of the next civil day.
- Proposal input at a skipped civil time yields no choice. A repeated civil time
  yields two explicit `(instant, offset)` choices. Send the selected instant plus
  its named zone, local timestamp, and offset so Postgres can verify consistency.
- Client-facing dates and timestamps stay inside the four-digit year range
  `0001..9999`.

### 4. Validation & Error Matrix

| Condition | Required result |
|-----------|-----------------|
| Missing/invalid public env value | `loadPublicConfig()` returns `null`; render setup state |
| Schema or normalization marker differs | Render schema-mismatch state; do not load a room |
| RPC returns `{ error }` | Throw `RoomRpcError(message, code)` without dropping SQLSTATE |
| Successful RPC returns malformed JSON | Zod throws; never cast the payload into domain state |
| SQLSTATE `40001` or message `schedule_version_conflict` | Classify only as a schedule version conflict; refetch before retry |
| Numeric or unknown time-zone identity | `RangeError("time_zone_invalid")` at the Temporal boundary |
| Nonexistent local proposal time | Return `[]`; require another civil time |
| Repeated local proposal time | Return both choices with distinct offsets |
| Invalid persisted preferences | Remove `muplaytime.preferences.v1` and return `{}` |
| Offline/realtime disconnect | Keep canonical cached snapshot visible; refetch on recovery |
| Non-idempotent submit received offline | Fail immediately; never pause or replay it on reconnect |
| Draft base version differs from current snapshot | Retain draft, show current vs intended output, require version-bound review |
| Viewer-day composition contains an interval crossing midnight | Clip it into adjacent non-overlapping daily pieces before concatenation |

### 5. Good / Base / Bad Cases

- **Good**: `2026-11-01T01:30` in `America/New_York` produces two choices; the
  user selects one and the complete source tuple is sent to the RPC.
- **Base**: `2026-03-08` in `Asia/Dubai` projects normally with no DST annotation.
- **Bad**: accepting `+04:00` as a schedule zone or deriving one instant silently
  from a repeated wall-clock time loses the user's intended occurrence.
- **Good**: a range draft opened at schedule v4 remains visible when v5 arrives;
  Save stays disabled until the member reviews v5 versus the intended v5 result.
- **Base**: a draft submitted while its base version is still current uses that
  captured expected version.
- **Bad**: using `schedule.version` from the latest render inside an older form
  callback silently overwrites a concurrent interval instead of conflicting.

### 6. Tests Required

- Run `npm run test:unit`. Assert New York and London skipped/repeated minutes,
  Dubai's no-DST case, the `1440` boundary, named-zone acceptance, numeric-offset
  rejection, and proposal choice cardinality.
- Assert `RoomRepository` preserves SQLSTATE and that only schedule serialization
  conflicts satisfy `isScheduleVersionConflict`.
- Assert malformed snapshot/config/preferences payloads fail closed through Zod.
- Assert a raw invite passed in an attempted preference patch is stripped and is
  absent from both web-storage mechanisms.
- Assert an offline mutation does not invoke its repository operation after a
  later `online` event, and a sheet opened offline can submit normally after a
  deliberate reconnect without retaining a stale offline closure.
- For explicit range, quick-paint, interval, restore, and timezone drafts,
  simulate a newer canonical schedule before submit; assert draft retention,
  disabled Save, current/intended comparison, and retry with only the reviewed
  version.
- Project a member interval across two viewer dates and a 1440-minute selection
  across three DST civil dates; assert composed intervals are unique,
  non-overlapping, and clipped to daily projection bounds.
- Run `npm run test:component` and `npm run test:e2e`; mutations must invalidate
  the room, stale schedule writes must surface conflict UX, and production routing
  must work under `/MuPlaytime/`.

### 7. Wrong vs Correct

#### Wrong

```ts
const snapshot = response.data as RoomSnapshot;
queryClient.setQueryData(roomKeys.snapshot(roomId), event.new);
const instant = new Date(`${localStart}${numericOffset}`).toISOString();
localStorage.setItem("invite", inviteToken);
```

This trusts external JSON, treats a freshness signal as canonical state, erases
DST ambiguity, and persists a room capability.

#### Correct

```ts
const snapshot = decodeRoomSnapshot(response.data);
await invalidateRoom(queryClient, roomId);
const choices = localProposalChoices(localStart, namedTimeZone);
// Keep the selected choice and invite token in memory only.
```

```ts
// WRONG: silently adopts a newer version for a draft created against old data.
await replaceDay(rebase(draft, latestIntervals), latestVersion);

// CORRECT: retain intent, require a version-bound comparison, then retry once.
if (latestVersion !== draft.baseVersion && reviewedVersion !== latestVersion)
  return showCurrentVsIntended(latestIntervals, draft.operations);
await replaceDay(rebase(draft, latestIntervals), latestVersion);
```
