# Supabase Database and RPC Contracts

> Executable contracts for migrations, room isolation, atomic RPC mutations,
> Realtime invalidation, and database error semantics.

## Scenario: Change the Supabase-backed room model

### 1. Scope / Trigger

Use this contract for every table, enum, policy, grant, migration, RPC, proposal
state transition, schedule write, normalization change, or Realtime publication.
There is no custom backend: these SQL boundaries are the application's server API.

### 2. Signatures

Authenticated browser clients may execute these public RPCs (all return `jsonb`):

```sql
get_schema_meta()
create_room(text, text, text)
join_room(text, text, text)
get_room_snapshot(uuid)
replace_weekly_day(uuid, smallint, integer, jsonb)
replace_date_override(uuid, date, integer, jsonb)
restore_date_override(uuid, date, integer)
migrate_schedule_zone(uuid, text, integer)
replace_weekly_pair(uuid, smallint, smallint, integer, jsonb, jsonb)
replace_date_override_pair(uuid, date, date, integer, jsonb, jsonb)
create_proposal_with_initial_option(uuid, text, timestamptz, integer, text, timestamp, text)
add_proposal_option(uuid, uuid, timestamptz, integer, text, timestamp, text)
rename_proposal(uuid, uuid, text)
cancel_proposal(uuid, uuid)
withdraw_proposal_option(uuid, uuid)
confirm_proposal_option(uuid, uuid, uuid)
set_option_response(uuid, uuid, response_choice)
set_threshold_watch(uuid, uuid, integer)
acknowledge_triggered_watch(uuid, uuid)
```

Internal enforcement lives in `private.invite_digest(text)`,
`private.request_auth_uid()`,
`private.require_auth_uid()`,
`private.is_room_member(uuid)`, `private.current_member(uuid)`,
`private.emit_room_change(uuid, text)`, and
`private.valid_concrete_option(timestamptz, text, timestamp, text)`. Do not grant
browser roles direct execution of private mutation helpers.

Schedule interval JSON is an array of:

```json
{"start_minute": 540, "end_minute": 720, "state": "free"}
```

Room creation returns room/member identity plus the one-time raw `invite_token`;
join returns room/member identity without the token. Void mutations return
`{"ok": true}`. Proposal creation returns `proposal_id` and `option_id`; adding an
option returns `option_id`.

### 3. Contracts

- Every migration is an ordered `supabase/migrations/<timestamp>_<name>.sql`
  transaction. Never edit an applied migration; append a new one. Schema/RPC
  changes must update `schema_meta.schema_version` and the matching frontend env
  contract when compatibility changes.
- The initial owner bootstrap is a Supabase/PostgreSQL 17 migration contract:
  migrations execute as reserved role `postgres`; `postgres` must temporarily
  receive `SET` membership in `muplaytime_api`, and `muplaytime_api` must
  temporarily receive `CREATE` on `public` and `private` before function owner
  transfers. Migration 003 revokes both schema `CREATE` privileges and the
  temporary role grant. PostgreSQL retains the role creator's ADMIN-only
  `pg_auth_members` row with `set_option = false` and
  `inherit_option = false`; that inert row is expected. Never attempt to grant
  the API owner to reserved role `supabase_admin`.
- All exposed tables have RLS enabled. `authenticated` receives room-scoped
  `SELECT` only, using `private.is_room_member(room_id)` backed by the signed
  PostgREST JWT `sub` and `(room_id, auth_user_id)` in `member_sessions`.
  `private.request_auth_uid()` mirrors Supabase's `auth.uid()` claim lookup
  without depending on `USAGE` for the platform-managed `auth` schema, which
  local/hosted reset may revoke from custom roles. Browser roles receive no direct
  domain-table `INSERT`, `UPDATE`, or `DELETE` grants; writes use RPCs.
- `SECURITY DEFINER` functions set `search_path = ''`, schema-qualify objects, and
  are owned by `muplaytime_api`, a `NOLOGIN NOINHERIT NOBYPASSRLS` non-superuser.
  Public and `anon` execution is revoked before `authenticated` execution is
  granted explicitly.
- Room ownership is structural: child tables carry `room_id`, and composite
  foreign keys bind referenced IDs to the same room. Every lookup and mutation
  includes `p_room_id`; never authorize by an object UUID alone.
- Schedule writes lock the current member's `schedule_sets` row, compare
  `p_expected_version`, replace intervals, increment the schedule version once,
  and emit one room-change event in the same transaction. Use the pair RPCs for
  cross-midnight edits so both civil days commit or roll back together.
- Weekly/date intervals are non-overlapping half-open ranges with
  `0 <= start_minute < end_minute <= 1440`. Dates and proposal timestamps are
  finite and restricted to years `0001..9999`.
- The database stores only `digest(raw_invite_token, 'sha256')`. Name claiming is
  deliberately room-local; concurrent same-normalized-name joins use
  `ON CONFLICT ... DO NOTHING` and then claim the existing member.
- Runtime RPCs do not depend on `USAGE` for Supabase-managed `auth` or
  `extensions` schemas because reset/configuration may remove those grants from
  custom roles. Invite tokens concatenate two core `pg_catalog.gen_random_uuid()`
  values (256 random bits); the only extension bridge is
  `private.invite_digest(text)`, an immutable, table-free, `postgres`-owned
  wrapper whose EXECUTE grant is limited to `muplaytime_api`.
- `normalize_name_v1` performs NFC normalization, Unicode whitespace trimming,
  and ICU-root lowercasing. `get_schema_meta` and normalization fail closed when
  the deployed ICU collation version differs from the recorded marker. Functions
  that call `pg_collation_actual_version` are `VOLATILE`, not `STABLE`, because
  they deliberately observe runtime collation state; `supabase db lint --local`
  must report no volatility mismatch.
- A concrete proposal option is valid only when the named zone exists and
  `(starts_at, source_time_zone, source_local_start, source_offset)` describes the
  same occurrence. Duration is `15..1440` minutes; game name is `1..120` trimmed
  characters.
- Proposal option votes are upserts; `NULL` means withdrawn. Watches trigger when
  active `accept` rows reach the positive threshold. Triggered watches remain
  acknowledgeable; pending watches close when their option/proposal becomes
  ineligible.
- `room_change_events` is append-only to `muplaytime_api` and published through
  `supabase_realtime`. Its RLS is room scoped; consumers use it only to refetch the
  canonical snapshot.

### 4. Validation & Error Matrix

| SQLSTATE | Stable message(s) | Meaning / caller action |
|----------|-------------------|-------------------------|
| `42501` | `authentication_required`, `room_claim_required` | Establish anonymous auth or claim the room; never retry as a public caller |
| `42501` | `proposal_rename_forbidden`, `proposal_cancel_forbidden`, `option_withdraw_forbidden`, `proposal_confirm_forbidden`, `watch_acknowledge_forbidden` | Actor/object/state authorization failed |
| `22023` | `name_empty`, `room_name_invalid`, `invite_invalid`, `time_zone_invalid`, `room_not_found`, `local_date_invalid` | Reject invalid identity or scalar input |
| `22023` | `schedule_payload_invalid`, `schedule_pair_payload_invalid`, `date_pair_payload_invalid` | Reject malformed/non-adjacent/non-array schedule replacement |
| `22023` | `proposal_payload_invalid`, `option_payload_invalid`, `game_name_invalid`, `proposal_not_found`, `threshold_invalid` | Reject malformed proposal input |
| `40001` | `schedule_version_conflict` | Stale optimistic concurrency version; refetch before a user retry |
| `55000` | `normalization_data_version_mismatch` | Stop service until bundle/database ICU markers are reconciled |
| `55000` | `proposal_not_open`, `option_not_response_eligible`, `watch_not_allowed` | Requested state transition is no longer valid |
| migration `42501` | `must be able to SET ROLE`, `permission denied for schema` | The migrator lacks temporary owner membership or the target owner lacks temporary schema `CREATE`; fix bootstrap and prove final revocation |
| migration `42601` | parser location inside a function body | SQL text passed static scans but failed PostgreSQL/PLpgSQL compilation; reproduce with a fresh `supabase db reset` |
| other constraint SQLSTATE | PostgreSQL/Supabase message | Preserve the code; do not relabel it as a version conflict |

Stable messages are API identifiers. Add a new message deliberately and update
frontend handling/tests in the same change.

### 5. Good / Base / Bad Cases

- **Good**: two clients replace different views of one schedule; the stale client
  gets `40001`, refetches, and does not overwrite the newer intervals.
- **Base**: an authenticated room member reads one snapshot and receives only rows
  whose composite keys belong to that room.
- **Bad**: granting `authenticated` direct table mutation, using a definer role
  with `BYPASSRLS`, or loading a proposal option by `option_id` without `room_id`
  creates a cross-room write path.

### 6. Tests Required

- Always run `npm run test:db:static`; assert RLS is enabled, browser DML grants
  are absent, the API owner cannot bypass RLS, change events are insert-only, RPC
  signatures exist, and version/source-time validation markers remain present.
- With Supabase CLI and Docker, run `supabase db reset` and `supabase test db`.
  pgTAP must verify functions, privileges, RLS, four-digit timestamps, and concrete
  proposal-source consistency. The privilege assertions must prove
  `muplaytime_api` is `NOLOGIN NOINHERIT NOBYPASSRLS`, cannot `CREATE` in either
  application schema, and cannot be set or inherited by `postgres`; do not
  incorrectly require the PostgreSQL 17 creator ADMIN-only row to disappear.
  Also assert it has no broad `auth`/`extensions` schema dependency while it can
  execute the narrow invite-digest wrapper.
- Run an adversarial two-room/two-session integration matrix: cross-room reads and
  writes fail, direct browser DML fails, wrong-room object UUIDs fail, and Realtime
  exposes no foreign-room event.
- Race two same-name joins and assert one room member/schedule is created while
  both sessions claim it. Race schedule writes and assert exactly one succeeds.
- Force failure in the second half of each pair replacement and assert the first
  half and version increment roll back. Verify every successful state-changing
  mutation appends exactly one room-change signal.
- Exercise proposal open/scheduled/cancelled transitions, immutable option
  withdrawal, response withdrawal/upsert, threshold trigger, close reasons, and
  post-trigger acknowledgement.

Static string checks are a fast guard, not a substitute for applied migrations,
RLS behavior, concurrency, and Realtime tests.

### 7. Wrong vs Correct

#### Wrong

```sql
grant insert, update, delete on public.responses to authenticated;

select * from public.proposal_options where id = p_option_id;
```

This bypasses transition logic and allows an identifier from another room to
enter the mutation path.

#### Correct

```sql
select target.* into option_row
from public.proposal_options target
where target.room_id = p_room_id and target.id = p_option_id
for update;

-- The authenticated client calls a SECURITY DEFINER RPC whose owner is
-- NOLOGIN NOINHERIT NOBYPASSRLS and whose search_path is empty.

-- Owner bootstrap is temporary and ends in migration 003:
revoke create on schema public, private from muplaytime_api;
revoke muplaytime_api from postgres;
```
