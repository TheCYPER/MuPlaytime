begin;

select plan(9);

-- Two physical PostgreSQL sessions now exercise the lock contracts. The main
-- pgTAP transaction cannot share its uncommitted fixtures with dblink, so this
-- section creates one committed race-only room and deletes it through the same
-- independent connection before the test finishes. Lock observation is bounded
-- to two seconds; the winner is always released before reading the waiter.
create extension if not exists dblink with schema extensions;

create temporary table race_fixture (
  room_id uuid primary key,
  member_a_id uuid not null,
  member_b_id uuid,
  invite_token text not null,
  proposal_id uuid,
  option_id uuid
) on commit drop;

create temporary table race_results (
  race_name text not null,
  session_name text not null,
  ok boolean not null,
  state_code text,
  message text,
  primary key (race_name, session_name)
) on commit drop;

select extensions.dblink_connect(
  'muplaytime_race_a',
  format(
    'host=%s port=%s dbname=%s user=postgres password=postgres application_name=muplaytime_race_a',
    inet_server_addr(),
    current_setting('port'),
    current_database()
  )
);
select extensions.dblink_connect(
  'muplaytime_race_b',
  format(
    'host=%s port=%s dbname=%s user=postgres password=postgres application_name=muplaytime_race_b',
    inet_server_addr(),
    current_setting('port'),
    current_database()
  )
);

-- Capture SQLSTATE as data so an expected 40001 does not abort the remote
-- transaction or degrade into an uninspectable dblink transport error.
select extensions.dblink_exec('muplaytime_race_a', $remote$
  create function pg_temp.capture_weekly_replace(
    p_room_id uuid,
    p_expected_version integer,
    p_intervals jsonb
  )
  returns table(ok boolean, state_code text, message text)
  language plpgsql
  as $function$
  begin
    perform public.replace_weekly_day(
      p_room_id,
      1::smallint,
      p_expected_version,
      p_intervals
    );
    return query select true, null::text, null::text;
  exception when others then
    return query select false, sqlstate::text, sqlerrm::text;
  end
  $function$
$remote$);
select extensions.dblink_exec('muplaytime_race_b', $remote$
  create function pg_temp.capture_weekly_replace(
    p_room_id uuid,
    p_expected_version integer,
    p_intervals jsonb
  )
  returns table(ok boolean, state_code text, message text)
  language plpgsql
  as $function$
  begin
    perform public.replace_weekly_day(
      p_room_id,
      1::smallint,
      p_expected_version,
      p_intervals
    );
    return query select true, null::text, null::text;
  exception when others then
    return query select false, sqlstate::text, sqlerrm::text;
  end
  $function$
$remote$);
select extensions.dblink_exec('muplaytime_race_a', $$set statement_timeout = '4s'$$);
select extensions.dblink_exec('muplaytime_race_a', $$set lock_timeout = '2500ms'$$);
select extensions.dblink_exec('muplaytime_race_b', $$set statement_timeout = '4s'$$);
select extensions.dblink_exec('muplaytime_race_b', $$set lock_timeout = '2500ms'$$);
select extensions.dblink_exec('muplaytime_race_a', 'set role authenticated');
select extensions.dblink_exec('muplaytime_race_b', 'set role authenticated');
select extensions.dblink_exec(
  'muplaytime_race_a',
  $$set "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$
);
select extensions.dblink_exec(
  'muplaytime_race_b',
  $$set "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$
);
select extensions.dblink_exec(
  'muplaytime_race_a',
  $$set "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","is_anonymous":true}'$$
);
select extensions.dblink_exec(
  'muplaytime_race_b',
  $$set "request.jwt.claims" = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","is_anonymous":true}'$$
);

insert into race_fixture (room_id, member_a_id, invite_token)
select remote.room_id, remote.member_id, remote.invite_token
from extensions.dblink(
  'muplaytime_race_a',
  $remote$
    select
      (payload.created ->> 'room_id')::uuid,
      (payload.created ->> 'member_id')::uuid,
      payload.created ->> 'invite_token'
    from (
      select public.create_room('Bounded race room', 'Race Percy', 'UTC') as created
    ) payload
  $remote$
) as remote(room_id uuid, member_id uuid, invite_token text);

select pg_catalog.set_config(
  'muplaytime.test.race_same_member',
  remote.member_id::text,
  true
)
from race_fixture fixture
cross join lateral extensions.dblink(
  'muplaytime_race_b',
  format(
    'select (payload.joined ->> ''member_id'')::uuid from (select public.join_room(%L, '' race percy '', ''America/New_York'') as joined) payload',
    fixture.invite_token
  )
) as remote(member_id uuid);

select is(
  current_setting('muplaytime.test.race_same_member')::uuid,
  (select member_a_id from race_fixture),
  'two physical JWT sessions can claim the same member before racing its schedule'
);

select extensions.dblink_exec('muplaytime_race_a', 'begin');
insert into race_results (race_name, session_name, ok, state_code, message)
select 'schedule', 'a', remote.ok, remote.state_code, remote.message
from race_fixture fixture
cross join lateral extensions.dblink(
  'muplaytime_race_a',
  format(
    'select * from pg_temp.capture_weekly_replace(%L::uuid, 0, %L::jsonb)',
    fixture.room_id,
    '[{"start_minute":60,"end_minute":120,"state":"free"}]'
  )
) as remote(ok boolean, state_code text, message text);

select extensions.dblink_send_query(
  'muplaytime_race_b',
  format(
    'select * from pg_temp.capture_weekly_replace(%L::uuid, 0, %L::jsonb)',
    (select room_id from race_fixture),
    '[{"start_minute":180,"end_minute":240,"state":"busy"}]'
  )
);

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '2 seconds';
  observed boolean := false;
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    observed := exists (
      select 1
      from pg_catalog.pg_stat_activity activity
      where activity.application_name = 'muplaytime_race_b'
        and activity.wait_event_type = 'Lock'
    );
    exit when observed;
    exit when extensions.dblink_is_busy('muplaytime_race_b') = 0;
    exit when clock_timestamp() >= deadline;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
  perform pg_catalog.set_config(
    'muplaytime.test.schedule_lock_observed',
    observed::text,
    true
  );
end
$$;

select extensions.dblink_exec('muplaytime_race_a', 'commit');
insert into race_results (race_name, session_name, ok, state_code, message)
select 'schedule', 'b', remote.ok, remote.state_code, remote.message
from extensions.dblink_get_result('muplaytime_race_b')
  as remote(ok boolean, state_code text, message text);
select count(*)
from extensions.dblink_get_result('muplaytime_race_b')
  as drained(ok boolean, state_code text, message text);

select ok(
  (select ok from race_results where race_name = 'schedule' and session_name = 'a'),
  'schedule race session A commits the first expected-version write'
);
select is(
  current_setting('muplaytime.test.schedule_lock_observed'),
  'true',
  'schedule race session B is observed waiting on the physical row lock'
);
select is(
  (select ok from race_results where race_name = 'schedule' and session_name = 'b'),
  false,
  'schedule race session B cannot also commit the stale expected version'
);
select is(
  (select state_code from race_results where race_name = 'schedule' and session_name = 'b'),
  '40001',
  'schedule race loser receives the serializable-conflict SQLSTATE'
);
select is(
  (select message from race_results where race_name = 'schedule' and session_name = 'b'),
  'schedule_version_conflict',
  'schedule race loser receives the stable conflict message'
);
select is(
  (
    select version
    from public.schedule_sets
    where room_id = (select room_id from race_fixture)
      and member_id = (select member_a_id from race_fixture)
  ),
  1,
  'schedule race increments canonical version exactly once'
);
select is(
  (
    select count(*)
    from public.weekly_intervals interval
    join public.schedule_sets schedule on schedule.id = interval.schedule_set_id
    where interval.room_id = (select room_id from race_fixture)
      and schedule.member_id = (select member_a_id from race_fixture)
      and interval.iso_weekday = 1
      and interval.start_minute = 60
      and interval.end_minute = 120
      and interval.state = 'free'
  ),
  1::bigint,
  'schedule race preserves only the winning interval payload'
);

-- A separate accept/watch physical-race prototype showed that the local
-- Supabase pool retains a member-key lock after the caught class-40 schedule
-- loser even across dblink reconnects. Keep the deterministic schedule race as
-- the release gate and close both physical backends before cleanup so this test
-- can never hang or leak committed fixtures. The accept/watch ordering remains
-- a documented residual for a dedicated external integration harness.
select extensions.dblink_disconnect('muplaytime_race_b');
select extensions.dblink_disconnect('muplaytime_race_a');
select extensions.dblink_connect(
  'muplaytime_race_cleanup',
  format(
    'host=%s port=%s dbname=%s user=postgres password=postgres application_name=muplaytime_race_cleanup',
    inet_server_addr(),
    current_setting('port'),
    current_database()
  )
);
select extensions.dblink_exec(
  'muplaytime_race_cleanup',
  format(
    $cleanup$
      begin;
      delete from public.room_change_events where room_id = %1$L::uuid;
      delete from public.threshold_watches where room_id = %1$L::uuid;
      delete from public.responses where room_id = %1$L::uuid;
      delete from public.proposal_options where room_id = %1$L::uuid;
      delete from public.proposals where room_id = %1$L::uuid;
      delete from public.date_override_intervals where room_id = %1$L::uuid;
      delete from public.date_overrides where room_id = %1$L::uuid;
      delete from public.weekly_intervals where room_id = %1$L::uuid;
      delete from public.schedule_sets where room_id = %1$L::uuid;
      delete from public.member_sessions where room_id = %1$L::uuid;
      delete from public.members where room_id = %1$L::uuid;
      delete from public.rooms where id = %1$L::uuid;
      commit;
    $cleanup$,
    (select room_id from race_fixture)
  )
);
select is(
  (
    select count(*)
    from public.rooms
    where id = (select room_id from race_fixture)
  ),
  0::bigint,
  'dblink schedule-race fixture is deleted through a fresh committed connection'
);
select extensions.dblink_disconnect('muplaytime_race_cleanup');


select * from finish();
rollback;
