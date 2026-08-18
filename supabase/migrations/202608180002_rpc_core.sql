begin;

create or replace function public.normalize_name_v1(p_raw text)
returns table (display_name text, normalized_name text)
language plpgsql
volatile
set search_path = ''
as $$
declare
  whitespace text := E' \t\n\r\f\v' || U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000';
  recorded_version text;
  actual_version text;
begin
  select meta.normalization_version into recorded_version from public.schema_meta meta where meta.singleton;
  select 'postgres-icu-root:' || coalesce(pg_catalog.pg_collation_actual_version(coll.oid), 'unknown')
    into actual_version
  from pg_catalog.pg_collation coll
  where coll.collname = 'muplaytime_root' and coll.collnamespace = 'public'::regnamespace;
  if recorded_version is distinct from actual_version then
    raise exception using errcode = '55000', message = 'normalization_data_version_mismatch';
  end if;
  display_name := btrim(normalize(coalesce(p_raw, ''), NFC), whitespace);
  if display_name = '' then
    raise exception using errcode = '22023', message = 'name_empty';
  end if;
  normalized_name := lower(display_name collate public.muplaytime_root);
  return next;
end
$$;
alter function public.normalize_name_v1(text) owner to muplaytime_api;

create or replace function private.invite_digest(p_token text)
returns bytea
language sql
immutable
security definer
set search_path = ''
as $$
  select extensions.digest(p_token, 'sha256')
$$;
revoke all on function private.invite_digest(text) from public, anon, authenticated;
grant execute on function private.invite_digest(text) to muplaytime_api;

create or replace function private.request_auth_uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
alter function private.request_auth_uid() owner to muplaytime_api;

create or replace function private.require_auth_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := private.request_auth_uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  return actor;
end
$$;
alter function private.require_auth_uid() owner to muplaytime_api;

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_sessions session
    where session.room_id = p_room_id
      and session.auth_user_id = private.request_auth_uid()
  )
$$;
alter function private.is_room_member(uuid) owner to muplaytime_api;

create or replace function private.current_member(p_room_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_auth_uid();
  member uuid;
begin
  select session.member_id into member
  from public.member_sessions session
  where session.room_id = p_room_id and session.auth_user_id = actor;
  if member is null then
    raise exception using errcode = '42501', message = 'room_claim_required';
  end if;
  return member;
end
$$;
alter function private.current_member(uuid) owner to muplaytime_api;

create or replace function private.emit_room_change(p_room_id uuid, p_topic text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.room_change_events (room_id, topic)
  values (p_room_id, p_topic)
$$;
alter function private.emit_room_change(uuid, text) owner to muplaytime_api;

revoke all on function public.normalize_name_v1(text) from public, anon;
revoke all on function private.request_auth_uid() from public, anon, authenticated;
revoke all on function private.require_auth_uid() from public, anon, authenticated;
revoke all on function private.current_member(uuid) from public, anon, authenticated;
revoke all on function private.emit_room_change(uuid, text) from public, anon, authenticated;
revoke all on function private.is_room_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;

create policy members_room_read on public.members for select to authenticated
  using (private.is_room_member(room_id));
create policy schedule_sets_room_read on public.schedule_sets for select to authenticated
  using (private.is_room_member(room_id));
create policy weekly_intervals_room_read on public.weekly_intervals for select to authenticated
  using (private.is_room_member(room_id));
create policy date_overrides_room_read on public.date_overrides for select to authenticated
  using (private.is_room_member(room_id));
create policy date_override_intervals_room_read on public.date_override_intervals for select to authenticated
  using (private.is_room_member(room_id));
create policy proposals_room_read on public.proposals for select to authenticated
  using (private.is_room_member(room_id));
create policy proposal_options_room_read on public.proposal_options for select to authenticated
  using (private.is_room_member(room_id));
create policy responses_room_read on public.responses for select to authenticated
  using (private.is_room_member(room_id));
create policy threshold_watches_room_read on public.threshold_watches for select to authenticated
  using (private.is_room_member(room_id));
create policy room_change_events_room_read on public.room_change_events for select to authenticated
  using (private.is_room_member(room_id));

create or replace function public.get_schema_meta()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  meta public.schema_meta%rowtype;
  actual_version text;
begin
  select target.* into meta from public.schema_meta target where target.singleton;
  select 'postgres-icu-root:' || coalesce(pg_catalog.pg_collation_actual_version(coll.oid), 'unknown')
    into actual_version
  from pg_catalog.pg_collation coll
  where coll.collname = 'muplaytime_root' and coll.collnamespace = 'public'::regnamespace;
  if meta.normalization_version is distinct from actual_version then
    raise exception using errcode = '55000', message = 'normalization_data_version_mismatch';
  end if;
  return jsonb_build_object(
    'schema_version', meta.schema_version,
    'normalization_version', meta.normalization_version
  );
end
$$;
alter function public.get_schema_meta() owner to muplaytime_api;

create or replace function public.create_room(
  p_room_name text,
  p_display_name text,
  p_initial_time_zone text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_auth_uid();
  token text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  room uuid;
  member uuid;
  display text;
  normalized text;
  clean_room_name text := btrim(coalesce(p_room_name, ''));
begin
  if char_length(clean_room_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'room_name_invalid';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_initial_time_zone) then
    raise exception using errcode = '22023', message = 'time_zone_invalid';
  end if;
  select name.display_name, name.normalized_name into display, normalized
  from public.normalize_name_v1(p_display_name) name;

  insert into public.rooms (room_name, invite_digest)
  values (clean_room_name, private.invite_digest(token))
  returning id into room;
  insert into public.members (room_id, display_name, normalized_name)
  values (room, display, normalized)
  returning id into member;
  insert into public.member_sessions (room_id, member_id, auth_user_id)
  values (room, member, actor);
  insert into public.schedule_sets (room_id, member_id, time_zone)
  values (room, member, p_initial_time_zone);
  perform private.emit_room_change(room, 'room_created');

  return jsonb_build_object(
    'room_id', room,
    'member_id', member,
    'display_name', display,
    'normalized_name', normalized,
    'invite_token', token
  );
end
$$;
alter function public.create_room(text, text, text) owner to muplaytime_api;

create or replace function public.join_room(
  p_invite_token text,
  p_display_name text,
  p_initial_time_zone text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_auth_uid();
  room uuid;
  member uuid;
  display text;
  normalized text;
  requested_normalized text;
  stored_display text;
  created_member boolean := false;
begin
  if char_length(coalesce(p_invite_token, '')) <> 64 then
    raise exception using errcode = '22023', message = 'invite_invalid';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_initial_time_zone) then
    raise exception using errcode = '22023', message = 'time_zone_invalid';
  end if;
  select target.id into room
  from public.rooms target
  where target.invite_digest = private.invite_digest(p_invite_token);
  if room is null then
    raise exception using errcode = '22023', message = 'invite_invalid';
  end if;

  select name.display_name, name.normalized_name into display, normalized
  from public.normalize_name_v1(p_display_name) name;
  requested_normalized := normalized;
  select existing.id, existing.display_name, existing.normalized_name into member, stored_display, normalized
  from public.members existing
  where existing.room_id = room and existing.normalized_name = requested_normalized;

  if member is null then
    insert into public.members (room_id, display_name, normalized_name)
    values (room, display, requested_normalized)
    on conflict (room_id, normalized_name) do nothing
    returning id, display_name, normalized_name into member, stored_display, normalized;
    created_member := member is not null;
    if created_member then
      insert into public.schedule_sets (room_id, member_id, time_zone)
      values (room, member, p_initial_time_zone);
    else
      select existing.id, existing.display_name, existing.normalized_name
      into member, stored_display, normalized
      from public.members existing
      where existing.room_id = room and existing.normalized_name = requested_normalized;
    end if;
  end if;

  insert into public.member_sessions (room_id, member_id, auth_user_id)
  values (room, member, actor)
  on conflict (room_id, auth_user_id)
  do update set member_id = excluded.member_id, last_seen_at = now();
  perform private.emit_room_change(room, 'member_claimed');

  return jsonb_build_object(
    'room_id', room,
    'member_id', member,
    'display_name', stored_display,
    'normalized_name', normalized
  );
end
$$;
alter function public.join_room(text, text, text) owner to muplaytime_api;

create or replace function public.get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_member uuid := private.current_member(p_room_id);
  result jsonb;
begin
  select jsonb_build_object(
    'room_id', room.id,
    'room_name', room.room_name,
    'current_member_id', current_member,
    'change_sequence', coalesce((select max(event.id) from public.room_change_events event where event.room_id = room.id), 0),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', member.id,
        'room_id', member.room_id,
        'display_name', member.display_name,
        'normalized_name', member.normalized_name,
        'created_at', member.created_at
      ) order by member.created_at, member.id)
      from public.members member where member.room_id = room.id
    ), '[]'::jsonb),
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', schedule.id,
        'room_id', schedule.room_id,
        'member_id', schedule.member_id,
        'time_zone', schedule.time_zone,
        'version', schedule.version,
        'weekly', coalesce((
          select jsonb_agg(jsonb_build_object(
            'iso_weekday', interval.iso_weekday,
            'start_minute', interval.start_minute,
            'end_minute', interval.end_minute,
            'state', interval.state
          ) order by interval.iso_weekday, interval.start_minute)
          from public.weekly_intervals interval where interval.schedule_set_id = schedule.id
        ), '[]'::jsonb),
        'overrides', coalesce((
          select jsonb_agg(jsonb_build_object(
            'local_date', override.local_date,
            'version', override.version,
            'intervals', coalesce((
              select jsonb_agg(jsonb_build_object(
                'start_minute', interval.start_minute,
                'end_minute', interval.end_minute,
                'state', interval.state
              ) order by interval.start_minute)
              from public.date_override_intervals interval where interval.date_override_id = override.id
            ), '[]'::jsonb)
          ) order by override.local_date)
          from public.date_overrides override where override.schedule_set_id = schedule.id
        ), '[]'::jsonb)
      ) order by schedule.created_at)
      from public.schedule_sets schedule where schedule.room_id = room.id
    ), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', proposal.id,
        'room_id', proposal.room_id,
        'created_by_member_id', proposal.created_by_member_id,
        'game_name', proposal.game_name,
        'status', proposal.status,
        'confirmed_option_id', proposal.confirmed_option_id,
        'created_at', proposal.created_at,
        'options', coalesce((
          select jsonb_agg(to_jsonb(option) - 'created_at' order by option.created_at)
          from public.proposal_options option where option.proposal_id = proposal.id
        ), '[]'::jsonb),
        'responses', coalesce((
          select jsonb_agg(jsonb_build_object(
            'room_id', response.room_id,
            'option_id', response.option_id,
            'member_id', response.member_id,
            'response', response.response,
            'withdrawn_at', response.withdrawn_at,
            'updated_at', response.updated_at
          ) order by response.updated_at)
          from public.responses response
          join public.proposal_options option on option.id = response.option_id and option.proposal_id = proposal.id
        ), '[]'::jsonb),
        'watches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', watch.id,
            'room_id', watch.room_id,
            'option_id', watch.option_id,
            'member_id', watch.member_id,
            'threshold', watch.threshold,
            'triggered_at', watch.triggered_at,
            'acknowledged_at', watch.acknowledged_at,
            'closed_at', watch.closed_at,
            'close_reason', watch.close_reason,
            'created_at', watch.created_at
          ) order by watch.created_at)
          from public.threshold_watches watch
          join public.proposal_options option on option.id = watch.option_id and option.proposal_id = proposal.id
        ), '[]'::jsonb)
      ) order by proposal.created_at desc)
      from public.proposals proposal where proposal.room_id = room.id
    ), '[]'::jsonb)
  ) into result
  from public.rooms room
  where room.id = p_room_id;
  if result is null then
    raise exception using errcode = '22023', message = 'room_not_found';
  end if;
  return result;
end
$$;
alter function public.get_room_snapshot(uuid) owner to muplaytime_api;

create or replace function public.replace_weekly_day(
  p_room_id uuid,
  p_iso_weekday smallint,
  p_expected_version integer,
  p_intervals jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member uuid := private.current_member(p_room_id);
  schedule uuid;
  current_version integer;
begin
  if p_iso_weekday not between 1 and 7 or jsonb_typeof(p_intervals) <> 'array' then
    raise exception using errcode = '22023', message = 'schedule_payload_invalid';
  end if;
  select target.id, target.version into schedule, current_version
  from public.schedule_sets target
  where target.room_id = p_room_id and target.member_id = member
  for update;
  if current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'schedule_version_conflict';
  end if;
  delete from public.weekly_intervals interval
  where interval.room_id = p_room_id and interval.schedule_set_id = schedule and interval.iso_weekday = p_iso_weekday;
  insert into public.weekly_intervals (room_id, schedule_set_id, iso_weekday, start_minute, end_minute, state)
  select p_room_id, schedule, p_iso_weekday, item.start_minute, item.end_minute, item.state::public.schedule_state
  from jsonb_to_recordset(p_intervals) as item(start_minute smallint, end_minute smallint, state text);
  update public.schedule_sets set version = version + 1, updated_at = now() where id = schedule;
  perform private.emit_room_change(p_room_id, 'weekly_schedule_replaced');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.replace_weekly_day(uuid, smallint, integer, jsonb) owner to muplaytime_api;

create or replace function public.replace_date_override(
  p_room_id uuid,
  p_local_date date,
  p_expected_version integer,
  p_intervals jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member uuid := private.current_member(p_room_id);
  schedule uuid;
  current_version integer;
  override uuid;
begin
  if not isfinite(p_local_date)
     or p_local_date not between date '0001-01-01' and date '9999-12-31'
     or jsonb_typeof(p_intervals) <> 'array' then
    raise exception using errcode = '22023', message = 'schedule_payload_invalid';
  end if;
  select target.id, target.version into schedule, current_version
  from public.schedule_sets target
  where target.room_id = p_room_id and target.member_id = member
  for update;
  if current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'schedule_version_conflict';
  end if;
  insert into public.date_overrides (room_id, schedule_set_id, local_date)
  values (p_room_id, schedule, p_local_date)
  on conflict (schedule_set_id, local_date)
  do update set version = public.date_overrides.version + 1, updated_at = now()
  returning id into override;
  delete from public.date_override_intervals interval where interval.date_override_id = override;
  insert into public.date_override_intervals (room_id, date_override_id, start_minute, end_minute, state)
  select p_room_id, override, item.start_minute, item.end_minute, item.state::public.schedule_state
  from jsonb_to_recordset(p_intervals) as item(start_minute smallint, end_minute smallint, state text);
  update public.schedule_sets set version = version + 1, updated_at = now() where id = schedule;
  perform private.emit_room_change(p_room_id, 'date_override_replaced');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.replace_date_override(uuid, date, integer, jsonb) owner to muplaytime_api;

create or replace function public.restore_date_override(p_room_id uuid, p_local_date date, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member uuid := private.current_member(p_room_id);
  schedule uuid;
  current_version integer;
begin
  if not isfinite(p_local_date)
     or p_local_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception using errcode = '22023', message = 'local_date_invalid';
  end if;
  select target.id, target.version into schedule, current_version from public.schedule_sets target
  where target.room_id = p_room_id and target.member_id = member for update;
  if current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'schedule_version_conflict';
  end if;
  delete from public.date_overrides override
  where override.room_id = p_room_id and override.schedule_set_id = schedule and override.local_date = p_local_date;
  update public.schedule_sets set version = version + 1, updated_at = now() where id = schedule;
  perform private.emit_room_change(p_room_id, 'date_override_restored');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.restore_date_override(uuid, date, integer) owner to muplaytime_api;

create or replace function public.migrate_schedule_zone(
  p_room_id uuid,
  p_time_zone text,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member uuid := private.current_member(p_room_id);
  schedule uuid;
  current_version integer;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception using errcode = '22023', message = 'time_zone_invalid';
  end if;
  select target.id, target.version into schedule, current_version
  from public.schedule_sets target
  where target.room_id = p_room_id and target.member_id = member for update;
  if current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'schedule_version_conflict';
  end if;
  update public.schedule_sets
  set time_zone = p_time_zone, version = version + 1, updated_at = now()
  where id = schedule;
  perform private.emit_room_change(p_room_id, 'schedule_zone_migrated');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.migrate_schedule_zone(uuid, text, integer) owner to muplaytime_api;

create or replace function public.replace_weekly_pair(
  p_room_id uuid,
  p_first_weekday smallint,
  p_second_weekday smallint,
  p_expected_version integer,
  p_first_intervals jsonb,
  p_second_intervals jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member uuid := private.current_member(p_room_id);
  schedule uuid;
  current_version integer;
begin
  if p_first_weekday not between 1 and 7
     or p_second_weekday <> (p_first_weekday % 7) + 1
     or jsonb_typeof(p_first_intervals) <> 'array'
     or jsonb_typeof(p_second_intervals) <> 'array' then
    raise exception using errcode = '22023', message = 'schedule_pair_payload_invalid';
  end if;
  select target.id, target.version into schedule, current_version
  from public.schedule_sets target
  where target.room_id = p_room_id and target.member_id = member for update;
  if current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'schedule_version_conflict';
  end if;
  delete from public.weekly_intervals interval
  where interval.room_id = p_room_id and interval.schedule_set_id = schedule
    and interval.iso_weekday in (p_first_weekday, p_second_weekday);
  insert into public.weekly_intervals (room_id, schedule_set_id, iso_weekday, start_minute, end_minute, state)
  select p_room_id, schedule, p_first_weekday, item.start_minute, item.end_minute, item.state::public.schedule_state
  from jsonb_to_recordset(p_first_intervals) as item(start_minute smallint, end_minute smallint, state text)
  union all
  select p_room_id, schedule, p_second_weekday, item.start_minute, item.end_minute, item.state::public.schedule_state
  from jsonb_to_recordset(p_second_intervals) as item(start_minute smallint, end_minute smallint, state text);
  update public.schedule_sets set version = version + 1, updated_at = now() where id = schedule;
  perform private.emit_room_change(p_room_id, 'weekly_schedule_pair_replaced');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.replace_weekly_pair(uuid, smallint, smallint, integer, jsonb, jsonb) owner to muplaytime_api;

create or replace function public.replace_date_override_pair(
  p_room_id uuid,
  p_first_date date,
  p_second_date date,
  p_expected_version integer,
  p_first_intervals jsonb,
  p_second_intervals jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member uuid := private.current_member(p_room_id);
  schedule uuid;
  current_version integer;
  first_override uuid;
  second_override uuid;
begin
  if not isfinite(p_first_date) or not isfinite(p_second_date)
     or p_first_date not between date '0001-01-01' and date '9999-12-31'
     or p_second_date not between date '0001-01-01' and date '9999-12-31'
     or p_second_date - p_first_date <> 1
     or jsonb_typeof(p_first_intervals) <> 'array'
     or jsonb_typeof(p_second_intervals) <> 'array' then
    raise exception using errcode = '22023', message = 'date_pair_payload_invalid';
  end if;
  select target.id, target.version into schedule, current_version
  from public.schedule_sets target
  where target.room_id = p_room_id and target.member_id = member for update;
  if current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'schedule_version_conflict';
  end if;
  insert into public.date_overrides (room_id, schedule_set_id, local_date)
  values (p_room_id, schedule, p_first_date)
  on conflict (schedule_set_id, local_date)
  do update set version = public.date_overrides.version + 1, updated_at = now()
  returning id into first_override;
  insert into public.date_overrides (room_id, schedule_set_id, local_date)
  values (p_room_id, schedule, p_second_date)
  on conflict (schedule_set_id, local_date)
  do update set version = public.date_overrides.version + 1, updated_at = now()
  returning id into second_override;
  delete from public.date_override_intervals interval
  where interval.date_override_id in (first_override, second_override);
  insert into public.date_override_intervals (room_id, date_override_id, start_minute, end_minute, state)
  select p_room_id, first_override, item.start_minute, item.end_minute, item.state::public.schedule_state
  from jsonb_to_recordset(p_first_intervals) as item(start_minute smallint, end_minute smallint, state text)
  union all
  select p_room_id, second_override, item.start_minute, item.end_minute, item.state::public.schedule_state
  from jsonb_to_recordset(p_second_intervals) as item(start_minute smallint, end_minute smallint, state text);
  update public.schedule_sets set version = version + 1, updated_at = now() where id = schedule;
  perform private.emit_room_change(p_room_id, 'date_override_pair_replaced');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.replace_date_override_pair(uuid, date, date, integer, jsonb, jsonb) owner to muplaytime_api;

revoke all on function public.get_schema_meta() from public, anon;
revoke all on function public.create_room(text, text, text) from public, anon;
revoke all on function public.join_room(text, text, text) from public, anon;
revoke all on function public.get_room_snapshot(uuid) from public, anon;
revoke all on function public.replace_weekly_day(uuid, smallint, integer, jsonb) from public, anon;
revoke all on function public.replace_date_override(uuid, date, integer, jsonb) from public, anon;
revoke all on function public.restore_date_override(uuid, date, integer) from public, anon;
revoke all on function public.migrate_schedule_zone(uuid, text, integer) from public, anon;
revoke all on function public.replace_weekly_pair(uuid, smallint, smallint, integer, jsonb, jsonb) from public, anon;
revoke all on function public.replace_date_override_pair(uuid, date, date, integer, jsonb, jsonb) from public, anon;

grant execute on function public.get_schema_meta() to authenticated;
grant execute on function public.create_room(text, text, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.get_room_snapshot(uuid) to authenticated;
grant execute on function public.replace_weekly_day(uuid, smallint, integer, jsonb) to authenticated;
grant execute on function public.replace_date_override(uuid, date, integer, jsonb) to authenticated;
grant execute on function public.restore_date_override(uuid, date, integer) to authenticated;
grant execute on function public.migrate_schedule_zone(uuid, text, integer) to authenticated;
grant execute on function public.replace_weekly_pair(uuid, smallint, smallint, integer, jsonb, jsonb) to authenticated;
grant execute on function public.replace_date_override_pair(uuid, date, date, integer, jsonb, jsonb) to authenticated;

commit;
