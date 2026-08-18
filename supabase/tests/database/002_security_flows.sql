begin;

select plan(124);

-- These fixed UUIDs model two invisible Supabase anonymous-auth JWT sessions.
-- The database boundary intentionally trusts the authenticated role plus the
-- request claim; no auth.users row is consulted by the application RPCs.

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config(
  'muplaytime.test.room_a',
  public.create_room('Room A', 'Percy', 'Asia/Dubai')::text,
  true
);
reset role;

select is(
  current_setting('muplaytime.test.room_a')::jsonb ->> 'display_name',
  'Percy',
  'authenticated anonymous session A creates a room'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config(
  'muplaytime.test.same_name_join',
  public.join_room(
    current_setting('muplaytime.test.room_a')::jsonb ->> 'invite_token',
    U&'\2003percy\00A0',
    'America/New_York'
  )::text,
  true
);
reset role;

select is(
  current_setting('muplaytime.test.same_name_join')::jsonb ->> 'member_id',
  current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id',
  'a second anonymous identity claims the normalized existing name'
);
select is(
  (
    select count(*)
    from public.members
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  1::bigint,
  'same-name claim creates no duplicate member'
);
select is(
  (
    select count(*)
    from public.schedule_sets
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  1::bigint,
  'same-name claim creates no duplicate schedule'
);
select is(
  (
    select display_name
    from public.members
    where id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  'Percy',
  'same-name claim preserves first display spelling'
);
select is(
  (
    select time_zone
    from public.schedule_sets
    where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  'Asia/Dubai',
  'same-name claim does not migrate the existing schedule anchor'
);

set local role authenticated;
select pg_catalog.set_config(
  'muplaytime.test.room_b',
  public.create_room('Room B', 'Percy', 'UTC')::text,
  true
);
reset role;

select isnt(
  current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
  current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
  'the second identity creates an independent room'
);
select isnt(
  current_setting('muplaytime.test.room_b')::jsonb ->> 'member_id',
  current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id',
  'the same normalized name remains room-local'
);

-- Move session B to a distinct member in Room A so later accept counts prove
-- per-member uniqueness while both JWT identities retain room access.
set local role authenticated;
select pg_catalog.set_config(
  'muplaytime.test.member_b',
  public.join_room(
    current_setting('muplaytime.test.room_a')::jsonb ->> 'invite_token',
    'Bob',
    'America/New_York'
  )::text,
  true
);
reset role;

select is(
  (
    select count(*)
    from public.members
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  2::bigint,
  'a distinct normalized name creates a second room member'
);
select isnt(
  current_setting('muplaytime.test.member_b')::jsonb ->> 'member_id',
  current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id',
  'session B now acts as its own member in Room A'
);

-- Session A has no claim in Room B. Exercise RLS reads and an RPC through the
-- actual authenticated role rather than inspecting policies as postgres.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (
    select count(*)
    from public.members
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  2::bigint,
  'a claimed identity can read its room roster through RLS'
);
select is(
  (
    select count(*)
    from public.members
    where room_id = (current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id')::uuid
  ),
  0::bigint,
  'RLS hides another room roster'
);
select is(
  (
    select count(*)
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id')::uuid
  ),
  0::bigint,
  'RLS hides another room change stream'
);
select throws_ok(
  format(
    'select public.get_room_snapshot(%L::uuid)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  ),
  '42501',
  'room_claim_required',
  'an authenticated outsider cannot call a room-scoped RPC'
);
select throws_ok(
  format(
    'insert into public.members (room_id, display_name, normalized_name) values (%L::uuid, ''Mallory'', ''mallory'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  ),
  '42501',
  'permission denied for table members',
  'authenticated clients cannot bypass RPCs with direct DML'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.create_room('No auth', 'Mallory', 'UTC')$$,
  '42501',
  'permission denied for function create_room',
  'the unauthenticated API role cannot execute room creation'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.create_room('No JWT', 'Mallory', 'UTC')$$,
  '42501',
  'authentication_required',
  'an authenticated role without a JWT subject is rejected'
);
reset role;

-- Optimistic schedule writes must preserve canonical state and events after a
-- stale version or an insert failure halfway through an atomic pair update.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.replace_weekly_day(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  1::smallint,
  0,
  '[{"start_minute":60,"end_minute":120,"state":"free"}]'::jsonb
);
reset role;

select is(
  (
    select version
    from public.schedule_sets
    where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  1,
  'a successful schedule replacement increments the version once'
);
select is(
  (
    select state::text
    from public.weekly_intervals
    where schedule_set_id = (
      select id
      from public.schedule_sets
      where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
    ) and iso_weekday = 1
  ),
  'free',
  'the successful schedule replacement persists its interval'
);
select pg_catalog.set_config(
  'muplaytime.test.schedule_event_count',
  (
    select count(*)::text
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  true
);

set local role authenticated;
select throws_ok(
  format(
    'select public.replace_weekly_day(%L::uuid, 1::smallint, 0, %L::jsonb)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    '[{"start_minute":180,"end_minute":240,"state":"busy"}]'
  ),
  '40001',
  'schedule_version_conflict',
  'a stale optimistic schedule write is rejected'
);
reset role;

select is(
  (
    select version
    from public.schedule_sets
    where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  1,
  'a stale write leaves the schedule version unchanged'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'start_minute', start_minute,
        'end_minute', end_minute,
        'state', state
      ) order by start_minute
    )
    from public.weekly_intervals
    where schedule_set_id = (
      select id
      from public.schedule_sets
      where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
    ) and iso_weekday = 1
  ),
  '[{"state":"free","end_minute":120,"start_minute":60}]'::jsonb,
  'a stale write does not replace existing intervals'
);
select is(
  (
    select count(*)
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  current_setting('muplaytime.test.schedule_event_count')::bigint,
  'a stale write emits no change event'
);

set local role authenticated;
select throws_ok(
  format(
    'select public.replace_weekly_pair(%L::uuid, 1::smallint, 2::smallint, 1, %L::jsonb, %L::jsonb)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    '[{"start_minute":300,"end_minute":360,"state":"busy"}]',
    '[{"start_minute":30,"end_minute":90,"state":"invalid"}]'
  ),
  '22P02',
  'invalid input value for enum public.schedule_state: "invalid"',
  'a failure in the second half aborts an atomic schedule pair replacement'
);
reset role;

select is(
  (
    select version
    from public.schedule_sets
    where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  1,
  'failed pair replacement rolls back its version increment'
);
select is(
  (
    select count(*)
    from public.weekly_intervals
    where schedule_set_id = (
      select id
      from public.schedule_sets
      where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
    ) and iso_weekday = 1 and start_minute = 60 and end_minute = 120 and state = 'free'
  ),
  1::bigint,
  'failed pair replacement restores the first day it deleted'
);
select is(
  (
    select count(*)
    from public.weekly_intervals
    where schedule_set_id = (
      select id
      from public.schedule_sets
      where member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
    ) and iso_weekday = 2
  ),
  0::bigint,
  'failed pair replacement persists none of its second day'
);
select is(
  (
    select count(*)
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  current_setting('muplaytime.test.schedule_event_count')::bigint,
  'failed pair replacement emits no change event'
);

-- Force a failure after proposal insertion but before the initial option can
-- persist. This test-only trigger proves statement atomicity, not just early
-- scalar validation.
create function pg_temp.fail_initial_option()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = 'test_initial_option_failure';
end
$$;

create trigger test_fail_initial_option
before insert on public.proposal_options
for each row execute function pg_temp.fail_initial_option();

select pg_catalog.set_config(
  'muplaytime.test.proposal_event_count',
  (
    select count(*)::text
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  true
);

set local role authenticated;
select throws_ok(
  format(
    'select public.create_proposal_with_initial_option(%L::uuid, ''Atomic probe'', timestamptz ''2026-08-18 12:00:00+00'', 60, ''UTC'', timestamp ''2026-08-18 12:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  ),
  'P0001',
  'test_initial_option_failure',
  'failure inserting the initial option aborts proposal creation'
);
reset role;

select is(
  (
    select count(*)
    from public.proposals
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  0::bigint,
  'forced initial-option failure leaves no proposal'
);
select is(
  (
    select count(*)
    from public.proposal_options
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  0::bigint,
  'forced initial-option failure leaves no option'
);
select is(
  (
    select count(*)
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  current_setting('muplaytime.test.proposal_event_count')::bigint,
  'forced initial-option failure emits no change event'
);

drop trigger test_fail_initial_option on public.proposal_options;
drop function pg_temp.fail_initial_option();

set local role authenticated;
select throws_ok(
  format(
    'select public.create_proposal_with_initial_option(%L::uuid, ''Bad local'', timestamptz ''2026-08-18 12:00:00+00'', 60, ''UTC'', timestamp ''2026-08-18 13:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  ),
  '22023',
  'proposal_payload_invalid',
  'proposal input rejects an instant/local-time mismatch'
);
select throws_ok(
  format(
    'select public.create_proposal_with_initial_option(%L::uuid, ''Bad offset'', timestamptz ''2026-08-18 12:00:00+00'', 60, ''UTC'', timestamp ''2026-08-18 12:00:00'', ''+01:00'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  ),
  '22023',
  'proposal_payload_invalid',
  'proposal input rejects an instant/offset mismatch'
);
select throws_ok(
  format(
    'select public.create_proposal_with_initial_option(%L::uuid, ''Bad zone'', timestamptz ''2026-08-18 12:00:00+00'', 60, ''+04:00'', timestamp ''2026-08-18 16:00:00'', ''+04:00'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  ),
  '22023',
  'proposal_payload_invalid',
  'proposal input rejects a numeric offset as timezone identity'
);
reset role;

select is(
  (
    select count(*)
    from public.proposals
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  0::bigint,
  'invalid concrete starts persist no partial proposal'
);

set local role authenticated;
select pg_catalog.set_config(
  'muplaytime.test.proposal',
  public.create_proposal_with_initial_option(
    (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
    'Deep Rock Galactic',
    timestamptz '2026-08-18 12:00:00+00',
    60,
    'UTC',
    timestamp '2026-08-18 12:00:00',
    'Z'
  )::text,
  true
);
reset role;

select is(
  (
    select count(*)
    from public.proposals proposal
    join public.proposal_options option
      on option.room_id = proposal.room_id and option.proposal_id = proposal.id
    where proposal.id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'proposal_id')::uuid
      and option.id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
  ),
  1::bigint,
  'successful proposal creation exposes its initial option atomically'
);
select is(
  (
    select count(*)
    from public.room_change_events
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
  ),
  current_setting('muplaytime.test.proposal_event_count')::bigint + 1,
  'successful proposal creation emits exactly one change event'
);

-- One member can change and withdraw a response without creating another row.
set local role authenticated;
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  'accept'
);
reset role;
select is(
  (
    select count(*)
    from public.responses
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  1::bigint,
  'first response creates one member/option row'
);

set local role authenticated;
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  'maybe'
);
reset role;
select is(
  (
    select response::text
    from public.responses
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  'maybe',
  'changing a response updates the existing row'
);

set local role authenticated;
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  null
);
reset role;
select ok(
  (
    select count(*) = 1 and bool_and(withdrawn_at is not null)
    from public.responses
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  'withdrawing a response keeps one inactive tombstone'
);

set local role authenticated;
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  'accept'
);
reset role;
select ok(
  (
    select count(*) = 1 and bool_and(response = 'accept' and withdrawn_at is null)
    from public.responses
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  'responding again reactivates the same unique row'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  'accept'
);
reset role;
select is(
  (
    select count(distinct member_id)
    from public.responses
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and response = 'accept' and withdrawn_at is null
  ),
  2::bigint,
  'two JWT identities acting as two members produce two distinct accepts'
);

-- With two current accepts, threshold 2 must trigger synchronously. Dropping
-- and restoring the count must never alter or retrigger that durable watch.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.set_threshold_watch(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  2
);
reset role;
select pg_catalog.set_config(
  'muplaytime.test.watch_a',
  (
    select id::text
    from public.threshold_watches
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  true
);
select pg_catalog.set_config(
  'muplaytime.test.watch_a_triggered_at',
  (
    select triggered_at::text
    from public.threshold_watches
    where id = current_setting('muplaytime.test.watch_a')::uuid
  ),
  true
);
select ok(
  (
    select triggered_at is not null and threshold = 2
    from public.threshold_watches
    where id = current_setting('muplaytime.test.watch_a')::uuid
  ),
  'an already-met custom threshold triggers immediately'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  null
);
reset role;
select is(
  (
    select triggered_at::text
    from public.threshold_watches
    where id = current_setting('muplaytime.test.watch_a')::uuid
  ),
  current_setting('muplaytime.test.watch_a_triggered_at'),
  'a later accept-count drop does not retract a triggered watch'
);

set local role authenticated;
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  'accept'
);
reset role;
select is(
  (
    select triggered_at::text
    from public.threshold_watches
    where id = current_setting('muplaytime.test.watch_a')::uuid
  ),
  current_setting('muplaytime.test.watch_a_triggered_at'),
  'meeting the count again does not retrigger the one-shot watch'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.acknowledge_triggered_watch(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  current_setting('muplaytime.test.watch_a')::uuid
);
reset role;
select ok(
  (
    select acknowledged_at is not null and closed_at is not null
    from public.threshold_watches
    where id = current_setting('muplaytime.test.watch_a')::uuid
  ),
  'acknowledging a triggered watch durably closes it'
);

set local role authenticated;
select public.set_threshold_watch(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid,
  2
);
reset role;
select ok(
  (
    select count(*) = 2 and count(*) filter (where triggered_at is not null) = 2
    from public.threshold_watches
    where option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  'an explicit post-acknowledgement watch is a fresh immediately evaluated row'
);

-- Session B suggests an alternative and creates an unmet watch on it. Creator
-- A confirms the original option, atomically closing the alternative path.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config(
  'muplaytime.test.alternative',
  public.add_proposal_option(
    (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
    (current_setting('muplaytime.test.proposal')::jsonb ->> 'proposal_id')::uuid,
    timestamptz '2026-08-18 14:00:00+00',
    60,
    'UTC',
    timestamp '2026-08-18 14:00:00',
    'Z'
  )::text,
  true
);
select public.set_threshold_watch(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.alternative')::jsonb ->> 'option_id')::uuid,
  99
);
reset role;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.confirm_proposal_option(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'proposal_id')::uuid,
  (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
);
reset role;

select ok(
  (
    select status = 'scheduled'
      and confirmed_option_id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id')::uuid
    from public.proposals
    where id = (current_setting('muplaytime.test.proposal')::jsonb ->> 'proposal_id')::uuid
  ),
  'confirmation schedules exactly the selected option'
);
select ok(
  (
    select closed_at is not null and close_reason = 'not_selected' and triggered_at is null
    from public.threshold_watches
    where option_id = (current_setting('muplaytime.test.alternative')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.member_b')::jsonb ->> 'member_id')::uuid
  ),
  'confirmation expires an untriggered watch on the alternative'
);

set local role authenticated;
select throws_ok(
  format(
    'select public.set_option_response(%L::uuid, %L::uuid, ''accept''::public.response_choice)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.alternative')::jsonb ->> 'option_id'
  ),
  '55000',
  'option_not_response_eligible',
  'the non-final alternative no longer accepts responses'
);
select lives_ok(
  format(
    'select public.set_option_response(%L::uuid, %L::uuid, ''maybe''::public.response_choice)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.proposal')::jsonb ->> 'option_id'
  ),
  'attendance on the confirmed option remains editable'
);
select throws_ok(
  format(
    'select public.add_proposal_option(%L::uuid, %L::uuid, timestamptz ''2026-08-18 16:00:00+00'', 60, ''UTC'', timestamp ''2026-08-18 16:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.proposal')::jsonb ->> 'proposal_id'
  ),
  '55000',
  'proposal_not_open',
  'confirmation closes the proposal to further alternatives'
);
reset role;

-- Build fresh open proposals for the authorization matrix. The earlier
-- proposal is intentionally scheduled, so reusing it would conflate actor
-- authorization with terminal-state rejection.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config(
  'muplaytime.test.authz_proposal_a',
  public.create_proposal_with_initial_option(
    (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
    'Authorization Matrix A',
    timestamptz '2026-08-19 12:00:00+00',
    60,
    'UTC',
    timestamp '2026-08-19 12:00:00',
    'Z'
  )::text,
  true
);
reset role;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config(
  'muplaytime.test.authz_option_b',
  public.add_proposal_option(
    (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
    (current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id')::uuid,
    timestamptz '2026-08-19 14:00:00+00',
    60,
    'UTC',
    timestamp '2026-08-19 14:00:00',
    'Z'
  )::text,
  true
);
select public.set_option_response(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.authz_option_b')::jsonb ->> 'option_id')::uuid,
  'accept'
);
select public.set_threshold_watch(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.authz_option_b')::jsonb ->> 'option_id')::uuid,
  1
);
reset role;
select pg_catalog.set_config(
  'muplaytime.test.authz_watch_b',
  (
    select id::text
    from public.threshold_watches
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
      and option_id = (current_setting('muplaytime.test.authz_option_b')::jsonb ->> 'option_id')::uuid
      and member_id = (current_setting('muplaytime.test.member_b')::jsonb ->> 'member_id')::uuid
  ),
  true
);

-- Room B supplies foreign proposal/option/watch identifiers. Session B is a
-- legitimate member in both rooms, so wrong-object tests cannot pass merely
-- because the caller lacks a target-room claim.
set local role authenticated;
select pg_catalog.set_config(
  'muplaytime.test.authz_proposal_b',
  public.create_proposal_with_initial_option(
    (current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id')::uuid,
    'Authorization Matrix B',
    timestamptz '2026-08-20 12:00:00+00',
    60,
    'UTC',
    timestamp '2026-08-20 12:00:00',
    'Z'
  )::text,
  true
);
select public.set_option_response(
  (current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id')::uuid,
  'accept'
);
select public.set_threshold_watch(
  (current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id')::uuid,
  (current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id')::uuid,
  1
);
reset role;
select pg_catalog.set_config(
  'muplaytime.test.authz_watch_room_b',
  (
    select id::text
    from public.threshold_watches
    where room_id = (current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id')::uuid
      and option_id = (current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id')::uuid
  ),
  true
);

-- Creator/suggester/watch-owner authority is independent from ordinary room
-- membership. Session B is a Room A member but cannot exercise creator powers
-- over A's proposal; session A cannot withdraw or acknowledge B-owned rows.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select throws_ok(
  format(
    'select public.rename_proposal(%L::uuid, %L::uuid, ''Hijacked'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id'
  ),
  '42501',
  'proposal_rename_forbidden',
  'a non-creator member cannot rename a proposal'
);
select throws_ok(
  format(
    'select public.cancel_proposal(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id'
  ),
  '42501',
  'proposal_cancel_forbidden',
  'a non-creator member cannot cancel a proposal'
);
select throws_ok(
  format(
    'select public.confirm_proposal_option(%L::uuid, %L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'option_id'
  ),
  '42501',
  'proposal_confirm_forbidden',
  'a non-creator member cannot confirm a proposal'
);
reset role;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  format(
    'select public.withdraw_proposal_option(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_option_b')::jsonb ->> 'option_id'
  ),
  '42501',
  'option_withdraw_forbidden',
  'a member cannot withdraw another suggester''s option'
);
select throws_ok(
  format(
    'select public.acknowledge_triggered_watch(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_watch_b')
  ),
  '42501',
  'watch_acknowledge_forbidden',
  'a member cannot acknowledge another member''s watch'
);
reset role;

-- Schedule RPCs deliberately expose no actor/member parameter: each derives
-- private.current_member(room_id). Exercise every schedule signature as B and
-- prove A's schedule is untouched; a caller-supplied wrong member is therefore
-- not applicable to this API surface.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.replace_weekly_day(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  3::smallint,
  0,
  '[]'::jsonb
);
select public.replace_date_override(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  date '2026-08-21',
  1,
  '[]'::jsonb
);
select public.restore_date_override(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  date '2026-08-21',
  2
);
select public.migrate_schedule_zone(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  'UTC',
  3
);
select public.replace_weekly_pair(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  4::smallint,
  5::smallint,
  4,
  '[]'::jsonb,
  '[]'::jsonb
);
select public.replace_date_override_pair(
  (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid,
  date '2026-08-22',
  date '2026-08-23',
  5,
  '[]'::jsonb,
  '[]'::jsonb
);
reset role;

select is(
  (
    select version
    from public.schedule_sets
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
      and member_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'member_id')::uuid
  ),
  1,
  'all B schedule RPCs leave A''s schedule version unchanged'
);
select is(
  (
    select version
    from public.schedule_sets
    where room_id = (current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id')::uuid
      and member_id = (current_setting('muplaytime.test.member_b')::jsonb ->> 'member_id')::uuid
  ),
  6,
  'all schedule RPCs resolve and mutate only B''s current member schedule'
);

-- create_room has no room/object authority dimension. join_room is authorized
-- by its capability and intentionally permits same-name claiming (proved near
-- the start of this file); a wrong invite is the applicable foreign boundary.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$select public.join_room(repeat('f', 64), 'Mallory', 'UTC')$$,
  '22023',
  'invite_invalid',
  'join_room rejects an unknown room capability'
);
reset role;

-- Every browser-callable public RPC is denied to anon at the grant boundary.
-- normalize_name_v1 is deliberately excluded: it is an internal normalization
-- primitive with no authenticated grant, not part of the browser RPC surface.
create temporary table rpc_surface (
  ordinal integer primary key,
  rpc_name text not null,
  signature text not null
) on commit drop;

insert into rpc_surface (ordinal, rpc_name, signature) values
  (1, 'get_schema_meta', 'public.get_schema_meta()'),
  (2, 'create_room', 'public.create_room(text,text,text)'),
  (3, 'join_room', 'public.join_room(text,text,text)'),
  (4, 'get_room_snapshot', 'public.get_room_snapshot(uuid)'),
  (5, 'replace_weekly_day', 'public.replace_weekly_day(uuid,smallint,integer,jsonb)'),
  (6, 'replace_date_override', 'public.replace_date_override(uuid,date,integer,jsonb)'),
  (7, 'restore_date_override', 'public.restore_date_override(uuid,date,integer)'),
  (8, 'migrate_schedule_zone', 'public.migrate_schedule_zone(uuid,text,integer)'),
  (9, 'replace_weekly_pair', 'public.replace_weekly_pair(uuid,smallint,smallint,integer,jsonb,jsonb)'),
  (10, 'replace_date_override_pair', 'public.replace_date_override_pair(uuid,date,date,integer,jsonb,jsonb)'),
  (11, 'create_proposal_with_initial_option', 'public.create_proposal_with_initial_option(uuid,text,timestamp with time zone,integer,text,timestamp without time zone,text)'),
  (12, 'add_proposal_option', 'public.add_proposal_option(uuid,uuid,timestamp with time zone,integer,text,timestamp without time zone,text)'),
  (13, 'rename_proposal', 'public.rename_proposal(uuid,uuid,text)'),
  (14, 'cancel_proposal', 'public.cancel_proposal(uuid,uuid)'),
  (15, 'withdraw_proposal_option', 'public.withdraw_proposal_option(uuid,uuid)'),
  (16, 'confirm_proposal_option', 'public.confirm_proposal_option(uuid,uuid,uuid)'),
  (17, 'set_option_response', 'public.set_option_response(uuid,uuid,public.response_choice)'),
  (18, 'set_threshold_watch', 'public.set_threshold_watch(uuid,uuid,integer)'),
  (19, 'acknowledge_triggered_watch', 'public.acknowledge_triggered_watch(uuid,uuid)');

select ok(
  not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE'),
  format('anon cannot execute %s', rpc_name)
)
from rpc_surface
order by ordinal;

-- Authenticated is a Postgres role, not proof of a JWT identity. All 18
-- actor-bound RPCs must still reject an empty subject. get_schema_meta is the
-- sole global exception and is intentionally usable for compatibility checks.
create temporary table actor_bound_rpc (
  ordinal integer primary key,
  rpc_name text not null,
  statement text not null
) on commit drop;

insert into actor_bound_rpc (ordinal, rpc_name, statement) values
  (1, 'create_room', $$select public.create_room('No JWT', 'Nobody', 'UTC')$$),
  (2, 'join_room', format(
    'select public.join_room(%L, ''Nobody'', ''UTC'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'invite_token'
  )),
  (3, 'get_room_snapshot', format(
    'select public.get_room_snapshot(%L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (4, 'replace_weekly_day', format(
    'select public.replace_weekly_day(%L::uuid, 1::smallint, 0, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (5, 'replace_date_override', format(
    'select public.replace_date_override(%L::uuid, date ''2026-08-24'', 0, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (6, 'restore_date_override', format(
    'select public.restore_date_override(%L::uuid, date ''2026-08-24'', 0)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (7, 'migrate_schedule_zone', format(
    'select public.migrate_schedule_zone(%L::uuid, ''UTC'', 0)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (8, 'replace_weekly_pair', format(
    'select public.replace_weekly_pair(%L::uuid, 1::smallint, 2::smallint, 0, ''[]''::jsonb, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (9, 'replace_date_override_pair', format(
    'select public.replace_date_override_pair(%L::uuid, date ''2026-08-24'', date ''2026-08-25'', 0, ''[]''::jsonb, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (10, 'create_proposal_with_initial_option', format(
    'select public.create_proposal_with_initial_option(%L::uuid, ''No JWT'', timestamptz ''2026-08-24 12:00:00+00'', 60, ''UTC'', timestamp ''2026-08-24 12:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id'
  )),
  (11, 'add_proposal_option', format(
    'select public.add_proposal_option(%L::uuid, %L::uuid, timestamptz ''2026-08-24 13:00:00+00'', 60, ''UTC'', timestamp ''2026-08-24 13:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id'
  )),
  (12, 'rename_proposal', format(
    'select public.rename_proposal(%L::uuid, %L::uuid, ''No JWT'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id'
  )),
  (13, 'cancel_proposal', format(
    'select public.cancel_proposal(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id'
  )),
  (14, 'withdraw_proposal_option', format(
    'select public.withdraw_proposal_option(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'option_id'
  )),
  (15, 'confirm_proposal_option', format(
    'select public.confirm_proposal_option(%L::uuid, %L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'proposal_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'option_id'
  )),
  (16, 'set_option_response', format(
    'select public.set_option_response(%L::uuid, %L::uuid, ''accept''::public.response_choice)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'option_id'
  )),
  (17, 'set_threshold_watch', format(
    'select public.set_threshold_watch(%L::uuid, %L::uuid, 1)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_a')::jsonb ->> 'option_id'
  )),
  (18, 'acknowledge_triggered_watch', format(
    'select public.acknowledge_triggered_watch(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_watch_b')
  ));

grant select on actor_bound_rpc to authenticated;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$select public.get_schema_meta()$$,
  'get_schema_meta is the documented non-actor global RPC'
);
select throws_ok(
  statement,
  '42501',
  'authentication_required',
  format('%s rejects an authenticated role without a JWT subject', rpc_name)
)
from actor_bound_rpc
order by ordinal;
reset role;

-- Cross-room matrix: session A has no Room B claim. These are all RPCs whose
-- first parameter is room_id. create_room, join_room and get_schema_meta have
-- no room-id dimension and are covered by their applicable boundaries above.
create temporary table cross_room_rpc (
  ordinal integer primary key,
  rpc_name text not null,
  statement text not null
) on commit drop;

insert into cross_room_rpc (ordinal, rpc_name, statement) values
  (1, 'get_room_snapshot', format(
    'select public.get_room_snapshot(%L::uuid)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (2, 'replace_weekly_day', format(
    'select public.replace_weekly_day(%L::uuid, 1::smallint, 0, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (3, 'replace_date_override', format(
    'select public.replace_date_override(%L::uuid, date ''2026-08-24'', 0, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (4, 'restore_date_override', format(
    'select public.restore_date_override(%L::uuid, date ''2026-08-24'', 0)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (5, 'migrate_schedule_zone', format(
    'select public.migrate_schedule_zone(%L::uuid, ''UTC'', 0)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (6, 'replace_weekly_pair', format(
    'select public.replace_weekly_pair(%L::uuid, 1::smallint, 2::smallint, 0, ''[]''::jsonb, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (7, 'replace_date_override_pair', format(
    'select public.replace_date_override_pair(%L::uuid, date ''2026-08-24'', date ''2026-08-25'', 0, ''[]''::jsonb, ''[]''::jsonb)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (8, 'create_proposal_with_initial_option', format(
    'select public.create_proposal_with_initial_option(%L::uuid, ''Foreign'', timestamptz ''2026-08-24 12:00:00+00'', 60, ''UTC'', timestamp ''2026-08-24 12:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id'
  )),
  (9, 'add_proposal_option', format(
    'select public.add_proposal_option(%L::uuid, %L::uuid, timestamptz ''2026-08-24 13:00:00+00'', 60, ''UTC'', timestamp ''2026-08-24 13:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id'
  )),
  (10, 'rename_proposal', format(
    'select public.rename_proposal(%L::uuid, %L::uuid, ''Foreign'')',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id'
  )),
  (11, 'cancel_proposal', format(
    'select public.cancel_proposal(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id'
  )),
  (12, 'withdraw_proposal_option', format(
    'select public.withdraw_proposal_option(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  )),
  (13, 'confirm_proposal_option', format(
    'select public.confirm_proposal_option(%L::uuid, %L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  )),
  (14, 'set_option_response', format(
    'select public.set_option_response(%L::uuid, %L::uuid, ''accept''::public.response_choice)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  )),
  (15, 'set_threshold_watch', format(
    'select public.set_threshold_watch(%L::uuid, %L::uuid, 1)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  )),
  (16, 'acknowledge_triggered_watch', format(
    'select public.acknowledge_triggered_watch(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_b')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_watch_room_b')
  ));

grant select on cross_room_rpc to authenticated;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  statement,
  '42501',
  'room_claim_required',
  format('%s rejects a caller without the target-room claim', rpc_name)
)
from cross_room_rpc
order by ordinal;
reset role;

-- Foreign-object matrix: session B is claimed in both rooms, but targets Room
-- A while supplying Room B object IDs. Composite room lookups must fail before
-- creator/suggester identity in the foreign room can become authority.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}',
  true
);
select pg_catalog.set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select throws_ok(
  format(
    'select public.add_proposal_option(%L::uuid, %L::uuid, timestamptz ''2026-08-24 13:00:00+00'', 60, ''UTC'', timestamp ''2026-08-24 13:00:00'', ''Z'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id'
  ),
  '22023',
  'proposal_not_found',
  'add option rejects a proposal ID from another room'
);
select throws_ok(
  format(
    'select public.rename_proposal(%L::uuid, %L::uuid, ''Foreign'')',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id'
  ),
  '42501',
  'proposal_rename_forbidden',
  'rename rejects a proposal ID from another room'
);
select throws_ok(
  format(
    'select public.cancel_proposal(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id'
  ),
  '42501',
  'proposal_cancel_forbidden',
  'cancel rejects a proposal ID from another room'
);
select throws_ok(
  format(
    'select public.withdraw_proposal_option(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  ),
  '42501',
  'option_withdraw_forbidden',
  'withdraw rejects an option ID from another room'
);
select throws_ok(
  format(
    'select public.confirm_proposal_option(%L::uuid, %L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'proposal_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  ),
  '42501',
  'proposal_confirm_forbidden',
  'confirm rejects proposal and option IDs from another room'
);
select throws_ok(
  format(
    'select public.set_option_response(%L::uuid, %L::uuid, ''accept''::public.response_choice)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  ),
  '55000',
  'option_not_response_eligible',
  'response rejects an option ID from another room'
);
select throws_ok(
  format(
    'select public.set_threshold_watch(%L::uuid, %L::uuid, 1)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_proposal_b')::jsonb ->> 'option_id'
  ),
  '55000',
  'watch_not_allowed',
  'watch creation rejects an option ID from another room'
);
select throws_ok(
  format(
    'select public.acknowledge_triggered_watch(%L::uuid, %L::uuid)',
    current_setting('muplaytime.test.room_a')::jsonb ->> 'room_id',
    current_setting('muplaytime.test.authz_watch_room_b')
  ),
  '42501',
  'watch_acknowledge_forbidden',
  'watch acknowledgement rejects a watch ID from another room'
);
reset role;

select ok(
  (
    select count(*) = 6
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'replace_weekly_day',
        'replace_date_override',
        'restore_date_override',
        'migrate_schedule_zone',
        'replace_weekly_pair',
        'replace_date_override_pair'
      )
      and pg_catalog.pg_get_function_arguments(procedure.oid) not ilike '%member%'
  ),
  'all schedule RPC signatures omit caller-controlled member authority'
);

select * from finish();
rollback;
