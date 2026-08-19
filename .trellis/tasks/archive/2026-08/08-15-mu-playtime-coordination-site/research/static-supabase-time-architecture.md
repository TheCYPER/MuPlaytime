# Research: Static React/Supabase and wall-time architecture

- Query: Define a planning-level architecture for a React/Vite GitHub Pages app using Supabase anonymous sessions, capability room invites, weak same-name claims, RLS/realtime, weekly wall-time schedules with date overrides and DST behavior, multi-option proposals/votes/threshold reminders, and `/MuPlaytime/` deployment.
- Scope: mixed (repository evidence plus stable platform constraints; external documentation was not live-verified)
- Date: 2026-08-17

## Findings

### Files found

- `.trellis/tasks/08-15-mu-playtime-coordination-site/prd.md` — authoritative product requirements and acceptance criteria.
- `.trellis/workflow.md` — requires research and cross-layer contracts to be persisted during planning.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — requires exact formats, validation ownership, and end-to-end data-flow mapping.
- `.trellis/spec/frontend/index.md` and `.trellis/spec/frontend/*.md` — frontend spec skeletons; no project conventions have been filled in.
- `.trellis/spec/backend/index.md` and `.trellis/spec/backend/*.md` — backend/database spec skeletons; no project conventions have been filled in.
- `AGENTS.md` — project-level Trellis instructions.
- No product source, package manifest, Vite configuration, Supabase migration, GitHub workflow, or Git repository metadata was found. The PRD independently records that state (`prd.md:11-15`).

### Requirement and code-pattern evidence

- The intended security model is explicitly a trusted-room, weak identity model: normalized names are claimable by anyone holding the room link (`prd.md:22-33`). It must not be described as account security.
- Every persisted domain row and aggregate must be room-scoped (`prd.md:25`, `prd.md:78-84`, `prd.md:111-125`).
- Weekly rules are local wall-time rules, while concrete proposal choices are instants stored in UTC with an IANA zone retained for explanation/editing (`prd.md:35-49`, `prd.md:86-90`).
- Votes and reminder thresholds are per option, not per proposal; thresholds must count distinct current accepts and persist one app-local reminder (`prd.md:51-76`).
- GitHub Pages must serve a project site under `/MuPlaytime/`, including safe refresh behavior (`prd.md:101-106`, `prd.md:126`).
- There are no existing product code patterns to reuse. The only applicable repository pattern is the cross-layer rule to centralize decoding/normalization and define exact boundary formats (`.trellis/spec/guides/cross-layer-thinking-guide.md:19-50`, `:93-101`).

### Recommended system boundary

```text
React/Vite static bundle on GitHub Pages
  -> Supabase public client configuration
  -> invisible anonymous Auth session (JWT; no auth UI)
  -> narrowly scoped SQL/RPC mutations + Postgres constraints/RLS
  -> room-scoped INSERT invalidation events
  -> canonical refetch and local projection into each viewer's time zone
```

Keep persistent browser storage limited to resumable Supabase auth state and non-authoritative preferences (last room/member hint, locale, viewer zone). Hold the raw invite only in current-tab memory, remove it from the fragment after claim, and prompt the user to copy/save it immediately. Postgres is authoritative. A local member name or room id must never grant access by itself.

Because GitHub Pages project paths share the entire `https://thecyper.github.io` origin, no browser-storage API can isolate the anonymous session from another same-origin script. The chosen MVP URL therefore carries an explicit owner-controlled-origin trust assumption; CSP reduces app-local injection but is not an origin boundary. A dedicated origin is the isolation upgrade.

Suggested frontend boundaries:

- `auth/session`: establish/restore the anonymous Supabase session before any room RPC.
- `rooms`: create room, consume invite capability, claim normalized member, and restore an authorized room.
- `schedule-domain`: the sole owner of wall-time validation, recurrence expansion, override resolution, DST disambiguation, and interval algebra.
- `proposals`: typed proposal/option/response/reminder contracts and mutation calls.
- `realtime`: subscribe, invalidate query keys, and refetch; components should not patch raw database events independently.
- `time-display`: format already-resolved instants in the current viewer's IANA zone. Changing viewer zone must never rewrite stored data.

### Room capability, anonymous sessions, and weak name claims

Use Supabase anonymous Auth only to obtain a durable browser-specific `auth.uid()` and authenticated JWT. A second device receives a different auth id; therefore ownership cannot be modeled as `members.auth_user_id`. Instead use:

- `rooms(id, invite_token_hash, created_at)`
- `members(id, room_id, display_name, normalized_name, ...)`
- `member_sessions(room_id, member_id, auth_user_id, created_at, last_seen_at)`
- `schedule_sets(id, room_id, member_id, time_zone, version, ...)` as the sole schedule-zone owner

Key constraints:

- `unique (room_id, normalized_name)`; database `normalize_name_v1` is authoritative: Unicode NFC, leading/trailing Unicode-White-Space trim only, then Unicode lowercase under a pinned Unicode/ICU root-locale data version. Preserve internal whitespace, avoid NFKC compatibility folding, store the first trimmed-NFC display spelling, reject empty, and never rename on a later equivalent claim. The client may preview but must handle the database result. AC1d owns the cross-layer vectors.
- `unique (room_id, auth_user_id)` if one anonymous browser session may act as only one member per room. The same `member_id` may have several session rows so same-name claiming works across devices.
- Use composite room-aware foreign keys throughout, such as `(room_id, member_id) -> members(room_id, id)`, so a child cannot reference a parent in another room even if an application bug supplies mismatched ids.

Creation and joining should be transaction-owning database functions, not a sequence of exposed table writes:

1. `create_room(display_name, initial_schedule_time_zone)` generates a cryptographically random invite token server-side, stores only a digest, creates the room/member/session/schedule mapping, and returns the raw capability once.
2. `join_room(invite_token, display_name, initial_schedule_time_zone)` hashes and resolves the token, finds-or-creates the normalized member, and adds the current `auth.uid()` mapping. A matching existing name intentionally grants that member's editing identity but never rewrites its schedule anchor; the supplied zone applies only to a newly created schedule.
3. Security-definer functions must be owned by a dedicated `NOLOGIN NOBYPASSRLS` non-table-owner role, set a safe empty/fixed `search_path`, fully qualify objects, derive the actor from `auth.uid()`, validate room/actor authority internally, and have default/anonymous execution revoked. Direct table writes remain denied.

Use a fragment invite such as `https://thecyper.github.io/MuPlaytime/#/join/<token>`. Fragments survive static hosting and are not sent in normal HTTP requests or `Referer` headers. After a successful claim, keep the raw capability only in current-tab memory long enough to copy/save it and replace the route with `#/room/<non-secret-room-id>`. Never persist it. The no-rotation MVP means a leaked saved link remains permanent until users abandon the room.

### RLS and Realtime contract

Enable RLS on every API-visible table. Read policies use a non-recursive security-definer boolean helper that exposes only whether the request's `auth.uid()` has a `member_sessions` claim in the target room. Browser roles cannot read `member_sessions` or auth ids directly. Direct table mutations are denied; domain writes use a narrow RPC surface.

Every browser-callable definer derives the actor from `auth.uid()` and validates stored room/member/creator/suggester authority inside the function. It never trusts a caller-supplied actor id and never assumes RLS will protect elevated execution. Revoke function execution from `PUBLIC` and `anon`, grant exact signatures to `authenticated`, and adversarially invoke every RPC as unauthenticated, cross-room, and wrong-actor clients.

Proposal transitions share one lock order: proposal row first, then option row where applicable. Add, respond, withdraw, confirm, cancel, and watch mutations recheck status and option activity after the locks. Confirmation rejects a withdrawn/foreign option. The same option lock serializes response and watch operations; each response RPC recounts accepts and triggers newly met watches before commit, and watch creation locks then recounts. This prevents late post-confirmation commits and lost threshold triggers.

Do not make domain-row `DELETE` delivery part of the freshness contract. Every successful room mutation inserts a topic-tagged `room_change_events` row in the same transaction. Publish only those authorized room-scoped INSERT signals. Because one change can affect several projections and rooms are small, every event invalidates all canonical queries for its room; the topic is diagnostic only. Also refetch on initial subscription, reconnect, tab visibility/online recovery, and mutation ambiguity. Realtime is freshness, not persistence or the sole source of truth.

### Weekly wall-time rules, overrides, and DST

Do not store weekly rules as precomputed UTC offsets. A suitable normalized model is:

- `schedule_sets(id, room_id, member_id, time_zone)` — IANA zone anchoring the set's wall-clock meaning.
- `weekly_intervals(id, schedule_set_id, iso_weekday, start_minute, end_minute, state)` — `state` is `free` or `busy`; `unknown` is absence, never a stored free default.
- `date_overrides(id, schedule_set_id, local_date, version)` — one full-day replacement snapshot.
- `date_override_intervals(id, date_override_id, start_minute, end_minute, state)`.

Deterministic resolution for a local date `D`:

1. Choose the full-day override when present; otherwise choose the matching weekly intervals.
2. Interpret each half-open local interval as the set of real instants whose zoned local date/minute belongs to it.
3. A nonexistent spring-forward minute contributes no instant; a repeated fall-back minute contributes both real occurrences.
4. Materialize zero, one, or several UTC intervals, coalesce adjacent results, and never emit a zero/negative interval. `1440` is the exclusive next-day boundary after cross-midnight input has been split.
5. Annotate skipped/repeated portions, then clip/project the same instants into the viewer range.

Use one pinned time library with IANA-zone support (prefer Temporal through a pinned polyfill if native support is not part of the browser contract). Never parse database timestamps with ad-hoc `Date` rules. The weekly editor, date snapshot, board, timezone migration preview, and tests must all call the same local-minute resolver.

Concrete proposal input is not silently disambiguated. If a local date/time has two possible instants, show both offsets and require a choice. If it has none, explain the gap and require an explicit nearby valid replacement. Persist the immutable chosen UTC instant, duration, source IANA zone, entered local value, and chosen offset.

Timezone behavior is resolved: viewer-zone changes are local only; keeping the schedule anchor writes nothing; migrating previews and then changes only `schedule_sets.time_zone` while preserving stored weekdays/dates/minutes. Existing-name claims never re-anchor a schedule, and proposal instants never participate in migration.

### Proposals, votes, and threshold reminders

Recommended core tables (all include `room_id` and room-aware foreign keys):

- `proposals(id, room_id, created_by_member_id, game_name, status, confirmed_option_id, ...)`
- `proposal_options(id, room_id, proposal_id, suggested_by_member_id, starts_at, duration_minutes, source_time_zone, source_local_start, source_offset, withdrawn_at, ...)`
- `responses(room_id, option_id, member_id, response, withdrawn_at, updated_at)` with `response in (accept, decline, maybe)` and `unique(option_id, member_id)` (or the equivalent room-prefixed key). Active aggregates exclude tombstones.
- `threshold_watches(id, room_id, option_id, member_id, threshold, triggered_at, acknowledged_at, closed_at, close_reason, ...)` with `threshold > 0` and at most one not-closed/unacknowledged watch per member/option.
- `room_change_events(id, room_id, topic, created_at)` as an insert-only invalidation stream.

Useful constraints include a unique option signature per proposal (`proposal_id`, `starts_at`, `duration_minutes`) to prevent accidental duplicate suggestions, positive bounded duration, and a deferred/careful foreign key ensuring `confirmed_option_id` belongs to the same proposal. Create the proposal and its mandatory initial option through one transaction-owning RPC; never expose a proposal-only insert or empty visible draft.

Generate reminders inside the serialized response/watch RPC transaction, not only in an online client or a racing asynchronous trigger:

1. Lock proposal then option, recheck state and actor authority, and write the response/watch change.
2. Count distinct active `accept` rows while the option serialization lock is still held.
3. Atomically set `triggered_at` for untriggered watches whose threshold is now met.
4. Never modify a response from reminder evaluation and never count watches as responses.
5. Keep `triggered_at` after counts fall so the same watch fires only once; `acknowledged_at` makes it processed but still auditable.
6. When creating a watch, acquire the same option lock and evaluate the current count immediately. Permit any positive threshold in storage; the UI can warn when it exceeds the current member count because future members could make it reachable.

The watch row itself can be the persistent in-app notification; add `closed_at` and a close reason for untriggered watches. Option withdrawal, non-selection during confirmation, and proposal cancellation atomically close affected untriggered watches; the scheduled final option remains active. Triggered watches never expire from those transitions and remain acknowledgeable regardless of option/proposal status. A separate notifications table is unnecessary unless the product later adds other notification types. Realtime invalidation supplies the online highlight, while stored timestamps supply offline recovery.

### GitHub Pages/Vite deployment

- Set Vite `base` to `/MuPlaytime/` (including the trailing slash) and build all assets through Vite/imported URLs or `import.meta.env.BASE_URL`; avoid root-absolute `/assets/...` paths.
- Prefer hash routing for the MVP (`#/join/...`, `#/room/...`). The server always receives `/MuPlaytime/`, so direct loads and refreshes do not rely on a nonexistent Pages rewrite. Browser history routing requires a tested `404.html` SPA fallback and is a needless deployment risk here.
- Deploy the reproducible `dist/` artifact from GitHub Actions/Pages, using a lockfile and clean install. The workflow needs Pages/id-token permissions and concurrency that prevents stale deployments; exact action/runtime versions must be selected and pinned when documentation can be checked.
- Only Supabase URL and its browser-safe public/publishable (historically `anon`) key may enter the bundle. RLS must assume both are public. Never put the service-role key, GitHub PAT, invite-token digest, or privileged database credentials in Vite variables.
- Do not persist the raw invite. Apply the strictest Pages-compatible app CSP verified from official docs, but document that the persisted anonymous session remains readable by any compromised same-origin page; `/MuPlaytime/` is a path, not an isolation boundary.
- Validate the built artifact from an actual `/MuPlaytime/` prefix, not only Vite dev mode: asset load, fresh visit to invite URL, refresh on room URL, anonymous-session restore, and both public URL and Realtime connectivity.
- Publish the separate personal-site project card only after public smoke acceptance. Require the application link; include a repository link only after separate public-repository authorization and a successful public URL check.

### Required validation matrix

- Two rooms with identical names and simultaneous activity: no query, Realtime event, aggregate, or mutation crosses rooms.
- Same normalized name (`" Percy "`, `"percy"`) from two devices: one member record, two allowed session claims, no duplicate response counts.
- NFC/decomposed accents collide, internal double/single spaces stay distinct, and full-width compatibility text stays distinct from ASCII; later claims retain the first display spelling.
- Fault injection between proposal and initial-option inserts leaves neither row visible or persisted.
- Confirm racing add/respond/withdraw/cancel: proposal-first/option-second locks make every result linearizable and reject late invalid transitions.
- Two accepts meeting a threshold and watch creation racing an accept: option serialization yields exactly one persistent trigger, no auto-accept, and no lost trigger.
- Weekly recurrence around US/UK spring-forward and fall-back, Dubai (no DST), midnight/`1440`, year boundaries, and a viewer zone different from the schedule zone; skipped minutes yield no reversed interval and repeated minutes yield both occurrences.
- Ambiguous proposal input requires an offset choice; nonexistent proposal input requires an explicit valid replacement.
- `unknown` gaps remain excluded from explicit-free counts without hiding proposal-eligible segments.
- Response withdrawal and date-override restoration reach a second client through a room-change INSERT rather than a domain DELETE payload.
- Any room-change INSERT invalidates every canonical query in that room; join, response-triggered reminder, confirmation, and cancellation refresh all affected cross-domain projections.
- Terminal option/proposal transitions close untriggered watches with a reason while triggered reminders remain acknowledgeable.
- Production build loaded and refreshed at `/MuPlaytime/` with fragment invite routing.
- Invoke every public RPC and direct table path with a different room/member/creator/suggester and with no valid anonymous session; the database rejects it independently of UI controls.

### External references and version status

These are the canonical documentation locations to verify during design/implementation. They were **not live-opened** because the project-mandated gstack `/browse` capability was unavailable in this agent environment; URLs and current semantics/versions are therefore unverified as of the research date.

- Supabase anonymous sign-ins: `https://supabase.com/docs/guides/auth/auth-anonymous`
- Supabase Row Level Security: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase Realtime/Postgres Changes: `https://supabase.com/docs/guides/realtime/postgres-changes`
- Supabase database functions/security: `https://supabase.com/docs/guides/database/functions`
- Vite static deployment/GitHub Pages: `https://vite.dev/guide/static-deploy.html#github-pages`
- GitHub Pages custom Actions workflow: `https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages`
- Temporal proposal/polyfill documentation: `https://tc39.es/proposal-temporal/docs/`

No package or action versions should be inferred from this note. At implementation start, live-check and pin compatible React, Vite, `@supabase/supabase-js`, router, Temporal/polyfill, Node, and GitHub Action versions; confirm anonymous-auth persistence/claims, Realtime room-filtered INSERT/RLS behavior, and current Pages workflow/CSP constraints against official docs.

### Related specs

- `.trellis/spec/guides/cross-layer-thinking-guide.md` — directly applicable; schema/RPC payloads, timestamp formats, and realtime event handling need one typed owner.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — recurrence/DST conversion, name normalization, room scoping, and status transitions must not be reimplemented across components.
- `.trellis/spec/frontend/` and `.trellis/spec/backend/` — currently placeholders, so they provide no settled framework, naming, migration, query, or test conventions.

## Caveats / Not Found

- No external page was live-verified and no current library/service/action version was established because the required gstack `/browse` skill was unavailable. All platform-specific details above must be confirmed against the listed official documentation before implementation.
- Supabase project settings, billing/quotas, region, anonymous-auth enablement, CAPTCHA/rate limits, Realtime publication configuration, and retention/cleanup policy do not exist yet.
- Anonymous browser sessions are not account recovery: clearing storage creates a new auth identity, and access is regained only through the intentionally weak invite-plus-name claim.
- Invite copy-after-refresh is intentionally unavailable: the app keeps the raw capability only in current-tab memory, and members must save/share the link while present. Never make the digest/queryable room table public.
- The shared `thecyper.github.io` origin can read the persisted anonymous session. This is an explicit MVP trust decision, not a mitigated isolation property; use a dedicated origin if the owner cannot trust every same-origin script.
- Unicode lowercase data can differ between JavaScript and Postgres. The database `normalize_name_v1` result and recorded root-locale data version are authoritative; the client is only a preview, AC1d vectors run on both sides, and a data-version change requires an explicit normalization migration.
- Recurrence expansion horizon/caching remains an implementation bound; do not materialize an unbounded recurrence. Timezone re-anchoring semantics are resolved in `design.md`.
- Realtime delivery is not a transactional notification guarantee; room-change INSERTs plus persisted canonical rows and reconnect refetch are required.
