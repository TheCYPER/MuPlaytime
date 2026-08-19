# MuPlaytime Technical and Experience Design

## 1. Design status and evidence

This design implements the converged requirements in `prd.md`. It is informed by:

- `research/static-supabase-time-architecture.md`
- `research/ux-time-loom-direction.md`
- `research/prd-convergence-audit.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`

The repository has no existing product framework or application conventions. Current third-party package versions, GitHub Action revisions, Supabase product settings, and font licenses were not live-verified because the project-mandated gstack `/browse` installation is gated by an unapproved global upgrade. Implementation must verify official documentation and pin compatible versions before scaffolding.

## 2. System architecture

```text
GitHub Pages: /MuPlaytime/
  React + TypeScript + Vite static bundle
    ├── hash routes and local UI preferences
    ├── typed domain modules
    ├── Temporal-based schedule materialization
    └── Supabase browser client
          ├── invisible anonymous Auth session
          ├── room claim RPCs
          ├── room-scoped read models with RLS
          ├── atomic domain mutation RPCs/constraints
          └── room-change INSERT invalidation stream
                ↓
          canonical refetch → decode once → domain projection → UI
```

GitHub Pages owns only delivery of the static bundle. Supabase is the hosted data plane. Postgres is authoritative. Persistent browser storage contains the resumable anonymous-auth session and non-authoritative UI preferences; the raw invite capability is held only in memory for the current tab and is never persisted by the app.

### Selected frontend stack

- React and TypeScript, built by Vite with `base: "/MuPlaytime/"`.
- A hash router so direct visits and refreshes never need a Pages rewrite.
- `@supabase/supabase-js` for Auth, PostgREST/RPC, and Realtime.
- TanStack Query for canonical cache ownership and refetch/invalidation.
- Temporal through a pinned polyfill unless the verified browser contract supports native Temporal consistently.
- Zod at external payload/config boundaries; components consume decoded domain values rather than raw database rows.
- i18next/react-i18next or an equivalently typed two-locale message owner; one implementation owns language detection and persistence.
- CSS Modules plus a small global `@layer reset, tokens, base, components, utilities` stylesheet. No generic component kit or utility-first visual defaults.
- Vitest, React Testing Library, and Playwright for unit, component, timezone-context, and end-to-end checks.

Exact packages and versions are implementation-time decisions after official documentation is checked. The dependency roles above are architectural contracts.

## 3. Frontend boundaries

```text
src/
  app/             bootstrap, providers, routes, error boundaries
  auth/            anonymous session establishment/restoration
  rooms/           create/join/claim, ephemeral invite, room context
  schedule/        interval types, paint algorithm, recurrence, overrides
  board/           overlap sweep, ranking, timetable projection
  proposals/       proposal/option/response/watch lifecycle
  realtime/        subscribe → invalidate → refetch coordination
  time/            Temporal adapters and localized formatting
  i18n/            en/zh-CN messages, locale detection, key parity
  ui/              accessible primitives and Time Loom components
  data/            generated/handwritten database decoders and repositories
```

Boundary rules:

- Database rows are decoded once in `data/`; React components never cast raw payloads.
- `schedule/` is the single owner of paint-and-replace, recurrence expansion, DST disambiguation, timezone migration preview, and interval algebra.
- `board/` is the single owner of explicit-free counts and suggested-window ranking.
- `proposals/` owns every proposal status transition and threshold-watch projection.
- Realtime events never patch component state directly. They invalidate room/query keys and trigger a canonical refetch.
- Viewer timezone and language are local preferences; schedule timezone and domain data are authoritative database values.

## 4. Routes and invite capability

- `#/` — create-room entry and invite-link explanation.
- `#/join/:inviteToken` — establish anonymous auth, claim a normalized name, then replace the route.
- `#/room/:roomId` — advisory group timetable.
- `#/room/:roomId/me` — recurring template, concrete date overrides, and schedule timezone actions.
- `#/room/:roomId/proposals` and `#/room/:roomId/proposals/:proposalId` — proposals and multi-option voting.

The invite token lives in the URL fragment, so normal HTTP requests and `Referer` headers do not contain it. `create_room` returns the raw token once; the database stores only a digest. After a successful claim, the app holds the raw token in memory for the current tab, replaces the route with the non-secret room id, and prompts the member to copy/save the link. It never writes the raw token to `localStorage`, `sessionStorage`, IndexedDB, or Postgres. Refreshing or closing the tab removes the in-app copy action; inviting later requires reopening or receiving a previously saved link. This limitation applies equally to creators and joiners.

The whole app ships without third-party runtime scripts and applies the strictest GitHub-Pages-compatible document Content Security Policy verified during implementation. CSP reduces app-local injection risk but does not create a storage boundary: `/MuPlaytime/`, the personal site, and every other project page share the `https://thecyper.github.io` origin. The MVP explicitly trusts all scripts on that origin and documents that a compromise on any same-origin page can steal the persisted anonymous session. A dedicated custom origin is the deferred isolation path.

## 5. Database model

Every domain table includes `room_id`. Composite foreign keys make cross-room references invalid even if client or RPC code supplies mismatched ids.

| Table | Purpose and key constraints |
|---|---|
| `rooms` | `id`, unique `invite_digest`, timestamps. No owner/admin column. |
| `members` | `id`, `room_id`, first-claim trimmed-NFC display name and `normalize_name_v1` key. Unique `(room_id, normalized_name)` and `(room_id, id)`; no duplicate schedule-timezone field. |
| `member_sessions` | Maps `(room_id, auth_user_id)` to the currently claimed `member_id`; several anonymous users may map to one member so same-name cross-device claiming works. Auth ids are not exposed in the roster. |
| `schedule_sets` | One active set per room/member with IANA `time_zone` and optimistic `version`. |
| `weekly_intervals` | Schedule set, ISO weekday, `start_minute`, `end_minute`, and `free|busy`; canonical rows never cross local midnight or overlap. |
| `date_overrides` | One full-day replacement snapshot per schedule set/local date with version metadata. |
| `date_override_intervals` | Canonical, non-overlapping intervals for a date override. An empty override explicitly makes the whole date unknown. |
| `proposals` | Creator, game name, `open|scheduled|cancelled`, confirmed option, timestamps. |
| `proposal_options` | Proposal, suggester, immutable `starts_at` UTC, positive duration, source IANA zone, entered local date/time, chosen source offset, withdrawal timestamp. Duplicate `(proposal, starts_at, duration)` suggestions are rejected. |
| `responses` | Option, member, `accept|decline|maybe`, `withdrawn_at`; unique `(room_id, option_id, member_id)`. Withdrawal updates the tombstone and active counts exclude it. |
| `threshold_watches` | Option, member, positive threshold, `triggered_at`, `acknowledged_at`, `closed_at`, and close reason. One not-closed/unacknowledged watch per member/option. |
| `room_change_events` | Insert-only room-scoped invalidation signal with topic and timestamp. Every successful room mutation inserts one in the same transaction; clients never treat it as domain state. |
| `schema_meta` | A readable schema contract version so the static client can fail clearly when migrations and bundle are incompatible. |

Intervals are stored as integer minutes in `[0, 1440]`; a cross-midnight paint is split into two local-day operations. Postgres constraints or transaction validation reject zero/negative durations and overlaps. `unknown` is absence, never a stored state.

## 6. RPC, validation, and RLS contracts

### Execution and authorization boundary

Every browser-callable mutation that must cross RLS is `SECURITY DEFINER`, owned by a dedicated `NOLOGIN NOBYPASSRLS` API role that is neither a table owner nor inheritable by browser roles. That role receives only the exact table privileges and internal RLS allowance needed by the functions. No definer is owned by a superuser, table owner, or role with `BYPASSRLS`.

Each function has an empty/fixed `search_path`, fully qualified objects, and strict input bounds. Every room-domain function uses this mandatory authorization sequence:

1. derive the actor from `auth.uid()` and reject a null/non-authenticated request;
2. resolve the actor's current member claim inside the target room through a private helper;
3. validate room membership plus member/creator/suggester authority from stored rows, never from a caller-supplied actor id;
4. lock and recheck any state used to authorize the transition;
5. perform the mutation and insert its `room_change_events` signal in the same transaction.

`create_room` has no prior room and instead authorizes the authenticated actor before creating it; `join_room` authorizes the actor and invite capability before establishing the claim. Default function execution is revoked from `PUBLIC` and `anon`; only the exact browser RPC signatures are granted to `authenticated`. The private current-member helper is not browser-executable. A separate non-recursive boolean membership helper may be used by read policies: it reads `member_sessions` through the private API role and exposes only whether the current `auth.uid()` has a claim in the supplied room. Browser roles receive no direct access to `member_sessions` or auth ids. Every public RPC receives the same adversarial test matrix; RLS is never assumed to protect code running inside a definer.

### Entry mutations

- `create_room(display_name, initial_schedule_time_zone)` validates auth, generates a cryptographically random token server-side, stores its digest, creates room/member/session/schedule rows atomically, inserts a room-change signal, and returns `{room_id, member_id, invite_token}`.
- `join_room(invite_token, display_name, initial_schedule_time_zone)` resolves the digest, performs authoritative normalization, and maps the caller's `auth.uid()` to the matching member. It uses the supplied zone only when creating a new member/schedule; an existing-name claim is mapping-only and never changes the existing schedule anchor.
- Name normalization is database-owned and versioned. `normalize_name_v1(raw)` applies Unicode NFC, removes only leading/trailing characters in Unicode `White_Space`, stores that value as the first claim's display spelling, then derives the key with Unicode lowercase under a pinned Unicode/ICU root-locale data version recorded in `schema_meta`. It never collapses internal whitespace or applies NFKC/compatibility folding, rejects an empty result, and never lets a later claim rename the member. The client only previews this algorithm and accepts the returned display/key as authoritative. Database and client tests include the exact AC1d vectors; a Unicode-data change requires an explicit normalization migration rather than silently changing comparisons.

### Domain mutations and lock order

- Full-day replacement RPCs update a weekly weekday or date override atomically from a canonical interval list and an expected version. Version mismatch returns a conflict that the UI explains and refetches.
- Schedule migration RPC previews and then conditionally updates the sole schedule-set timezone with an expected version. Keep-anchor does not mutate the schedule set; it only changes the local viewer preference. Migrate preserves local weekday/date/minute fields and changes their IANA anchor.
- `create_proposal_with_initial_option(...)` validates the creator and concrete time, then inserts the proposal, its required first option, and one room-change signal in a single transaction. There is no browser-visible empty draft state and no separate proposal-only creation RPC.
- Every status-dependent proposal RPC locks the proposal row first. An option-specific RPC then locks its option row. Under those locks it rechecks proposal status, room/proposal membership, option withdrawal, and the stored actor capability before mutating.
- Add-option, rename, cancel, withdraw-option, respond, set/change-watch, and confirm all follow that order. Confirm rejects a withdrawn or foreign option. A response or new/changed watch is allowed only for an active option on an open proposal or the confirmed option on a scheduled proposal. This prevents an operation that observed `open` from committing after confirmation or cancellation.
- Option start/duration are immutable. Option withdrawal is a state transition. Response withdrawal updates `withdrawn_at` rather than deleting the row, so active aggregates ignore it while Realtime does not depend on delete payloads.
- The locked option row is also the serialization gate for responses and watches. After a response upsert/withdrawal, the RPC recounts distinct active accepts and marks every newly met watch. Watch creation/change acquires the same proposal-then-option locks and recounts after the lock. Concurrent accepts and watch creation therefore cannot miss a threshold; no client or asynchronous trigger owns correctness.
- Withdraw-option expires that option's untriggered watches with `option_withdrawn`; confirmation expires untriggered watches on every non-final option with `not_selected`; cancellation expires all remaining untriggered watches with `proposal_cancelled`. Because each transition holds the proposal lock, these closures are atomic with the terminal state. The scheduled final option keeps its untriggered watches active while attendance is editable.
- A triggered watch is never expired by an option/proposal transition. `acknowledge_triggered_watch` derives the actor, locks the owned watch row, requires `triggered_at`, and may run regardless of proposal/option status; it does not require an active option. Closed untriggered watches cannot be edited or re-armed, and each closure/acknowledgement emits the same transaction's room-change signal.

Concurrent tests cover confirm versus add/respond/withdraw/cancel, two accepts meeting one threshold, and watch creation racing with an accept. All outcomes must be linearizable under the documented lock order.

### RLS and public configuration

Read policies call the non-recursive room-membership helper. Direct browser table mutations are denied; writes go through the authorized RPC surface above. Composite room foreign keys remain defense in depth. The publishable/anon browser key is treated as public. Service-role and database credentials are used only by controlled migration/provisioning commands and never by Vite.

## 7. Schedule and timezone resolution

### Paint-and-replace

The client edits a canonical full-day list rather than issuing overlapping row patches:

1. Load the current day intervals and version.
2. Split existing intervals at the new range boundaries.
3. Remove overlapped pieces, insert the new state, merge adjacent equal-state pieces, and validate the result.
4. Send the complete canonical day plus expected version to one replacement RPC.
5. On conflict, preserve the user's pending paint, refetch, and offer an explicit retry rather than silently overwriting another device.

For a concrete date's first edit, materialize that date from the weekly rule in its schedule timezone, create a full-day override snapshot, then apply the paint. `Restore weekly template` deletes the override transactionally.

### Recurrence and DST

Weekly rules remain local wall-clock values. `schedule_sets.time_zone` is the only authoritative schedule anchor; viewer zones are browser preferences and `members` has no duplicate timezone column. For a finite visible range, the schedule domain:

1. chooses the full-day date override when present, otherwise the ISO-weekday template;
2. interprets each half-open local interval as the set of real instants whose zoned local date/minute lies inside it;
3. uses IANA transition data to materialize zero, one, or several UTC intervals and coalesces adjacent results;
4. projects those immutable instants into the viewer zone.

This local-minute set contract is total across DST. Nonexistent spring-forward minutes contribute no instants; repeated fall-back minutes contribute both occurrences. An interval wholly inside a gap resolves to no UTC interval, never to a collapsed or reversed row. `end_minute = 1440` is the exclusive next-local-day boundary, and cross-midnight paints are split before resolution. Weekly rules, date overrides, board projection, snapshot creation, and migration previews all call this one resolver. The UI annotates skipped/repeated portions and exposes local time plus offset in details. Tests cover no-DST Dubai, representative US and UK transitions, midnight/year boundaries, and intervals starting, ending, or lying wholly inside a transition.

Proposal entry follows a stricter concrete-instant contract. A valid local date/time with one possible instant can be stored directly. If it is ambiguous, the UI shows both offset-labeled occurrences and requires the user to choose one. If it is nonexistent, the UI does not shift silently; it explains the gap, offers nearby valid choices, and requires an explicit replacement. The option stores the chosen UTC instant plus its source IANA zone, entered local value, and chosen offset for later explanation.

### Timezone change preview

- Viewer-zone change: local preference only, no database mutation.
- Keep anchor: the existing schedule-set timezone and recurrence stay unchanged; the timetable is merely viewed in the new viewer zone.
- Migrate: preview the next representative weeks and every stored date override, then preserve local weekday/date/clock fields while changing the schedule-set IANA zone. Concrete proposal option instants never participate.

## 8. Advisory overlap projection

The visible range is resolved to non-overlapping UTC intervals per member. An interval sweep over every boundary derives segments containing:

```ts
type OverlapSegment = {
  start: Temporal.Instant;
  end: Temporal.Instant;
  freeMemberIds: MemberId[];
  busyMemberIds: MemberId[];
  unknownMemberIds: MemberId[];
};
```

The UI shows `free / total` plus the three inspectable member lists. A selection crossing several segments keeps those boundaries and values visible: its compact label reports the minimum free count and, when values differ, the range (for example, `minimum 2 / 5 · range 2–4 / 5`). It never averages the counts into a misleading attendance number. A 30-minute display/edit grid is the MVP interaction resolution, but domain storage and interval math remain minute-based. Suggested windows rank by free count, then contiguous duration, then earliest instant. Ranking never disables lower-count times and never becomes an automatic proposal.

## 9. Proposal, response, and reminder state

```text
open proposal
  ├── add immutable option (any claimed member)
  ├── withdraw own option (suggester)
  ├── respond per option (each member)
  ├── rename/cancel (proposal creator)
  └── confirm one option (proposal creator)
          ↓
scheduled proposal
  ├── final-option attendance remains editable
  ├── non-final options are read-only
  └── cancel (proposal creator); reschedule means new proposal
```

Threshold watches are per member/option. A new or changed untriggered threshold checks the current distinct accept count. Once `triggered_at` is set, it remains set if counts fall; acknowledgement closes it without changing a response. A later explicit watch is a new row/generation and is evaluated again. Realtime only accelerates visibility; the stored watch timestamps provide offline durability.

## 10. Realtime and failure behavior

`room_change_events` is the only required Postgres Changes publication for domain freshness. Every successful create/join/schedule/proposal/option/response/watch mutation inserts a room-scoped event with a diagnostic topic in the same database transaction; if the event insert fails, the mutation rolls back. Clients subscribe only to authorized `INSERT` events filtered by room. Because rooms are intentionally small and one mutation can affect roster totals, overlap projection, proposal state, responses, and reminders at once, every received event invalidates and refetches all canonical queries for that room. Topics may explain activity but never narrow correctness. This contract is independent of whether a domain mutation used `UPDATE`, `DELETE`, or full-day row replacement.

RLS remains the authorization boundary for event delivery, and the exact deployed Supabase INSERT/filter/RLS behavior must pass a two-room integration probe before launch. Initial subscription, reconnect, tab visibility recovery, online recovery, and mutation ambiguity always refetch canonical state, so the event stream is freshness rather than durable domain storage. The small-group MVP accepts append-only event growth; operational retention can later remove old signals without changing app semantics.

The UI distinguishes:

- optimistic local editing from confirmed server state;
- offline/reconnecting from a failed mutation;
- version conflict from validation failure;
- missing/invalid invite from a temporarily unavailable service;
- schema mismatch from ordinary network failure.

No failed write is presented as saved. Retry is explicit and idempotent where possible.

## 11. Experience design: Time Loom / 时间织机

### Subject and single job

The subject is a small cross-timezone co-op lobby. The room view's single job is to let friends see the strength of overlap at a glance and turn any observed window into a proposal. It must not resemble an enterprise resource calendar or a neon gaming dashboard.

### Tokens

- Cloud Canvas `#F1F3F9` — page and unknown timeline.
- Night Thread `#20263D` — text, rules, and primary controls.
- Free Jade `#087C6B` — explicit free intervals.
- Busy Coral `#B33E57` — busy/working intervals.
- Shuttle Violet `#5F4FB2` — selection, links, and active navigation.
- Common Gold `#E2A629` — high-overlap rendezvous knots with dark text and an explicit count.

State includes texture and text: free is solid with an open-circle motif, busy is diagonally hatched, and unknown is an unfilled dotted rail.

Typography uses a restrained clock-like display face (`ZCOOL QingKe HuangYou` with CJK fallback), a readable bilingual body face (`Noto Sans SC` plus system fallbacks), and `IBM Plex Mono` for times with tabular numerals. Font licenses, subset strategy, and hosting must be verified before implementation.

### Layout

```text
DESKTOP
┌ MU/PLAYTIME [English/简体中文] [Viewer zone] [Invite] [Claimed name] ┐
├ ‹ Week ›          [Group] [My schedule] [Plan a game / 发起游戏提议] ┤
│ MON                 TUE                     │ PROPOSALS              │
│ Percy  ···████────                           │ Game / option totals   │
│ Lina   ///██████──  ← rendezvous shuttle     │ Threshold reminders    │
│ Omar   ···████────     3 of 5 marked free    │ + Suggest time         │
│        [Propose this time / 提议此时段]       │                        │
└──────────────────────────────────────────────┴────────────────────────┘

MOBILE
┌ Timetable                 [简体中文] [⋯] ┐
│ Tue 18 · Viewer: Dubai                       │
├ Percy  18  20  22  00 →                     │
│ Lina   ···████────                           │
│ Omar   ///██████──   3 / 5 free              │
│ [Propose this time]                          │
├ Next proposal · option votes                 │
└ [Schedule] [Proposals] [Me] ─────────────────┘
```

Desktop is one continuous board with sticky member/day headers and a compact proposal rail, not a collection of rounded cards. The spatial time axis is always the viewer timezone; schedule-zone and member-local times are supplementary callouts in headers, the shuttle inspector, or details, never competing row axes. Mobile defaults to one day, scrolls in four-hour sections, and uses full-height editing/detail sheets, including a selected-window sheet that lists every segment's free/busy/unknown membership.

### Signature interaction

The Rendezvous Shuttle / 会合梭 is a two-handled selection spanning every member row. It remains anchored to UTC while revealing each member's local date/time. As it moves in 30-minute steps, the segment counts, minimum/range summary, and knot strength update; every selection offers `Propose this time` regardless of the count.

The shuttle is the single visual risk. It has two independently focusable 44px handles with range-slider semantics, descriptive values, and arrow-key adjustment; ordinary start/end date-time fields provide an equivalent path. On touch screens, only a gesture initiated on a handle moves that boundary, while gestures begun elsewhere retain ordinary horizontal timeline panning. Reduced-motion mode updates instantly. Weaving cues remain confined to interval texture and the shuttle; glassmorphism, neon black, gradient metrics, generic avatars, and excessive pills are excluded.

## 12. Localization and accessibility

- English and `zh-CN` message catalogs have key-parity tests and typed access.
- Language detection runs once on first visit; manual choice wins and is local-only.
- `Intl`/Temporal formatting derives dates and weekdays from locale and viewer zone; domain instants are never localized strings.
- The timetable uses grid semantics and an alternate list/summary for assistive technology. Interactive cells have descriptive member/status/time labels.
- Patterns and labels supplement every status color. Focus rings, contrast, touch targets, keyboard order, live-region save/error feedback, and reduced motion are acceptance requirements.

## 13. Deployment, rollout, and rollback

### Prerequisites

- Verify and pin current official React/Vite/Supabase/Temporal/router/test packages and GitHub Actions.
- Create/configure a Supabase project: region/quotas accepted by the user, anonymous auth enabled, migrations applied, the `room_change_events` Realtime publication enabled, and public URL/key recorded as GitHub configuration.
- Initialize the local Git repository and create `TheCYPER/MuPlaytime` only with the required GitHub write authorization.
- Inventory current first- and third-party scripts served anywhere on `https://thecyper.github.io`, apply the app CSP, and record the user's explicit acceptance that the shared origin can read the persisted anonymous session. If that trust boundary is unacceptable at launch, stop and move the app to a dedicated origin rather than claiming path isolation.

### Order

1. Apply additive database schema/functions/RLS and run isolation tests.
2. Build the frontend against the matching `schema_meta` version.
3. Deploy Pages and run the public two-client smoke flow.
4. Add and validate the separate personal-site project YAML with the application URL; add `repoUrl` only when repository publication is separately authorized and publicly reachable.
5. Publish/dispatch the personal site only after the application URL passes.

Frontend rollback uses a previous verified Pages artifact/commit. Database changes are additive during the MVP; destructive migrations require a backup and a forward repair rather than assuming a safe down migration. The personal-site card can remain draft or be reverted independently if the application is unavailable.

No commit, push, repository creation, Pages configuration change, Supabase project creation/migration, personal-site publish, or workflow dispatch is performed merely by task activation; each external or Git publishing action follows its authorization gate.

## 14. Risks and deferred items

- Invite links are permanent capabilities with no rotation or deletion UI. Leakage requires abandoning the room.
- The app does not persist raw invites, so members must save/share the generated link while it is available in the current tab.
- Same-name claiming is intentional impersonation risk, not authentication.
- The target project path shares browser storage with every `thecyper.github.io` page. CSP does not isolate origins; a compromised same-origin script can steal the anonymous session. The MVP accepts that owner-controlled-origin trust explicitly, while a dedicated origin remains the security upgrade.
- Public anonymous room creation can consume hosted-service quota; abuse controls and billing limits must be reviewed before public launch.
- No self-service room deletion means retention is controlled outside the app in the MVP.
- Realtime can miss events; insert-only room signals plus canonical reconnect/focus refetch are mandatory.
- Unicode name normalization must match server behavior; database output is authoritative.
- Timezone migration and DST annotations require dedicated tests and careful copy.
- The dense timetable and bilingual strings require screenshot and keyboard QA at both target viewports.
- Current package/action semantics and font licenses remain live-verification prerequisites, not assumptions.
