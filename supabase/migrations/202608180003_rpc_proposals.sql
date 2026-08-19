begin;

create or replace function private.valid_concrete_option(
  p_starts_at timestamptz,
  p_source_time_zone text,
  p_source_local_start timestamp without time zone,
  p_source_offset text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    isfinite(p_starts_at)
    and isfinite(p_source_local_start)
    and p_starts_at between timestamptz '0001-01-01 00:00:00+00'
      and timestamptz '9999-12-31 23:59:59.999999+00'
    and p_source_local_start between timestamp '0001-01-01 00:00:00'
      and timestamp '9999-12-31 23:59:59.999999'
    and p_source_offset ~ '^(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$'
    and exists (select 1 from pg_catalog.pg_timezone_names where name = p_source_time_zone)
    and (p_starts_at at time zone p_source_time_zone) = p_source_local_start
    and (p_source_local_start - (p_starts_at at time zone 'UTC')) =
      case when p_source_offset = 'Z' then interval '0 minutes' else p_source_offset::interval end,
    false
  )
$$;
alter function private.valid_concrete_option(timestamptz, text, timestamp without time zone, text) owner to muplaytime_api;
revoke all on function private.valid_concrete_option(timestamptz, text, timestamp without time zone, text) from public, anon, authenticated;

create or replace function public.create_proposal_with_initial_option(
  p_room_id uuid,
  p_game_name text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_source_time_zone text,
  p_source_local_start timestamp without time zone,
  p_source_offset text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal uuid;
  option_id uuid;
  clean_game text := btrim(coalesce(p_game_name, ''));
begin
  if char_length(clean_game) not between 1 and 120
     or p_duration_minutes not between 15 and 1440
     or private.valid_concrete_option(p_starts_at, p_source_time_zone, p_source_local_start, p_source_offset) is not true then
    raise exception using errcode = '22023', message = 'proposal_payload_invalid';
  end if;
  insert into public.proposals (room_id, created_by_member_id, game_name)
  values (p_room_id, actor, clean_game)
  returning id into proposal;
  insert into public.proposal_options (
    room_id, proposal_id, suggested_by_member_id, starts_at, duration_minutes,
    source_time_zone, source_local_start, source_offset
  ) values (
    p_room_id, proposal, actor, p_starts_at, p_duration_minutes,
    p_source_time_zone, p_source_local_start, p_source_offset
  ) returning id into option_id;
  perform private.emit_room_change(p_room_id, 'proposal_created');
  return jsonb_build_object('proposal_id', proposal, 'option_id', option_id);
end
$$;
alter function public.create_proposal_with_initial_option(uuid, text, timestamptz, integer, text, timestamp without time zone, text) owner to muplaytime_api;

create or replace function public.add_proposal_option(
  p_room_id uuid,
  p_proposal_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_source_time_zone text,
  p_source_local_start timestamp without time zone,
  p_source_offset text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal public.proposals%rowtype;
  option_id uuid;
begin
  if p_duration_minutes not between 15 and 1440
     or private.valid_concrete_option(p_starts_at, p_source_time_zone, p_source_local_start, p_source_offset) is not true then
    raise exception using errcode = '22023', message = 'option_payload_invalid';
  end if;
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = p_proposal_id for update;
  if proposal.id is null then raise exception using errcode = '22023', message = 'proposal_not_found'; end if;
  if proposal.status <> 'open' then raise exception using errcode = '55000', message = 'proposal_not_open'; end if;
  insert into public.proposal_options (
    room_id, proposal_id, suggested_by_member_id, starts_at, duration_minutes,
    source_time_zone, source_local_start, source_offset
  ) values (
    p_room_id, proposal.id, actor, p_starts_at, p_duration_minutes,
    p_source_time_zone, p_source_local_start, p_source_offset
  ) returning id into option_id;
  perform private.emit_room_change(p_room_id, 'proposal_option_added');
  return jsonb_build_object('option_id', option_id);
end
$$;
alter function public.add_proposal_option(uuid, uuid, timestamptz, integer, text, timestamp without time zone, text) owner to muplaytime_api;

create or replace function public.rename_proposal(p_room_id uuid, p_proposal_id uuid, p_game_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal public.proposals%rowtype;
  clean_game text := btrim(coalesce(p_game_name, ''));
begin
  if char_length(clean_game) not between 1 and 120 then raise exception using errcode = '22023', message = 'game_name_invalid'; end if;
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = p_proposal_id for update;
  if proposal.id is null or proposal.status <> 'open' or proposal.created_by_member_id <> actor then
    raise exception using errcode = '42501', message = 'proposal_rename_forbidden';
  end if;
  update public.proposals set game_name = clean_game, updated_at = now() where id = proposal.id;
  perform private.emit_room_change(p_room_id, 'proposal_renamed');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.rename_proposal(uuid, uuid, text) owner to muplaytime_api;

create or replace function public.cancel_proposal(p_room_id uuid, p_proposal_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal public.proposals%rowtype;
begin
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = p_proposal_id for update;
  if proposal.id is null or proposal.created_by_member_id <> actor then
    raise exception using errcode = '42501', message = 'proposal_cancel_forbidden';
  end if;
  if proposal.status = 'cancelled' then return jsonb_build_object('ok', true); end if;
  update public.proposals set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = proposal.id;
  update public.threshold_watches watch
  set closed_at = now(), close_reason = 'proposal_cancelled', updated_at = now()
  where watch.room_id = p_room_id and watch.triggered_at is null and watch.closed_at is null
    and exists (select 1 from public.proposal_options option where option.id = watch.option_id and option.proposal_id = proposal.id);
  perform private.emit_room_change(p_room_id, 'proposal_cancelled');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.cancel_proposal(uuid, uuid) owner to muplaytime_api;

create or replace function public.withdraw_proposal_option(p_room_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal_id uuid;
  proposal public.proposals%rowtype;
  option_row public.proposal_options%rowtype;
begin
  select option.proposal_id into proposal_id from public.proposal_options option
  where option.room_id = p_room_id and option.id = p_option_id;
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = proposal_id for update;
  select target.* into option_row from public.proposal_options target
  where target.room_id = p_room_id and target.id = p_option_id and target.proposal_id = proposal.id for update;
  if proposal.id is null or option_row.id is null or proposal.status <> 'open' or option_row.suggested_by_member_id <> actor or option_row.withdrawn_at is not null then
    raise exception using errcode = '42501', message = 'option_withdraw_forbidden';
  end if;
  update public.proposal_options set withdrawn_at = now() where id = option_row.id;
  update public.threshold_watches set closed_at = now(), close_reason = 'option_withdrawn', updated_at = now()
  where room_id = p_room_id and option_id = option_row.id and triggered_at is null and closed_at is null;
  perform private.emit_room_change(p_room_id, 'proposal_option_withdrawn');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.withdraw_proposal_option(uuid, uuid) owner to muplaytime_api;

create or replace function public.confirm_proposal_option(p_room_id uuid, p_proposal_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal public.proposals%rowtype;
  option_row public.proposal_options%rowtype;
begin
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = p_proposal_id for update;
  select target.* into option_row from public.proposal_options target
  where target.room_id = p_room_id and target.proposal_id = proposal.id and target.id = p_option_id for update;
  if proposal.status <> 'open' or proposal.created_by_member_id <> actor
     or option_row.id is null or option_row.withdrawn_at is not null then
    raise exception using errcode = '42501', message = 'proposal_confirm_forbidden';
  end if;
  update public.proposals set status = 'scheduled', confirmed_option_id = option_row.id, updated_at = now() where id = proposal.id;
  update public.threshold_watches watch
  set closed_at = now(), close_reason = 'not_selected', updated_at = now()
  where watch.room_id = p_room_id and watch.triggered_at is null and watch.closed_at is null
    and watch.option_id <> option_row.id
    and exists (select 1 from public.proposal_options option where option.id = watch.option_id and option.proposal_id = proposal.id);
  perform private.emit_room_change(p_room_id, 'proposal_confirmed');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.confirm_proposal_option(uuid, uuid, uuid) owner to muplaytime_api;

create or replace function public.set_option_response(
  p_room_id uuid,
  p_option_id uuid,
  p_response public.response_choice default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal_id uuid;
  proposal public.proposals%rowtype;
  option_row public.proposal_options%rowtype;
  accept_count integer;
begin
  select option.proposal_id into proposal_id from public.proposal_options option
  where option.room_id = p_room_id and option.id = p_option_id;
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = proposal_id for update;
  select target.* into option_row from public.proposal_options target
  where target.room_id = p_room_id and target.id = p_option_id and target.proposal_id = proposal.id for update;
  if proposal.id is null or option_row.id is null or option_row.withdrawn_at is not null or proposal.status = 'cancelled'
     or (proposal.status = 'scheduled' and proposal.confirmed_option_id <> option_row.id) then
    raise exception using errcode = '55000', message = 'option_not_response_eligible';
  end if;
  insert into public.responses (room_id, option_id, member_id, response, withdrawn_at)
  values (p_room_id, option_row.id, actor, coalesce(p_response, 'maybe'), case when p_response is null then now() else null end)
  on conflict (room_id, option_id, member_id)
  do update set response = excluded.response, withdrawn_at = excluded.withdrawn_at, updated_at = now();
  select count(*) into accept_count from public.responses response
  where response.room_id = p_room_id and response.option_id = option_row.id
    and response.response = 'accept' and response.withdrawn_at is null;
  update public.threshold_watches
  set triggered_at = now(), updated_at = now()
  where room_id = p_room_id and option_id = option_row.id
    and triggered_at is null and closed_at is null and threshold <= accept_count;
  perform private.emit_room_change(p_room_id, 'option_response_changed');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.set_option_response(uuid, uuid, public.response_choice) owner to muplaytime_api;

create or replace function public.set_threshold_watch(p_room_id uuid, p_option_id uuid, p_threshold integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  proposal_id uuid;
  proposal public.proposals%rowtype;
  option_row public.proposal_options%rowtype;
  watch_id uuid;
  accept_count integer;
begin
  if p_threshold <= 0 then raise exception using errcode = '22023', message = 'threshold_invalid'; end if;
  select option.proposal_id into proposal_id from public.proposal_options option
  where option.room_id = p_room_id and option.id = p_option_id;
  select target.* into proposal from public.proposals target
  where target.room_id = p_room_id and target.id = proposal_id for update;
  select target.* into option_row from public.proposal_options target
  where target.room_id = p_room_id and target.id = p_option_id and target.proposal_id = proposal.id for update;
  if proposal.id is null or option_row.id is null or option_row.withdrawn_at is not null or proposal.status = 'cancelled'
     or (proposal.status = 'scheduled' and proposal.confirmed_option_id <> option_row.id) then
    raise exception using errcode = '55000', message = 'watch_not_allowed';
  end if;
  select watch.id into watch_id from public.threshold_watches watch
  where watch.room_id = p_room_id and watch.option_id = option_row.id and watch.member_id = actor
    and watch.triggered_at is null and watch.closed_at is null for update;
  if watch_id is null then
    insert into public.threshold_watches (room_id, option_id, member_id, threshold)
    values (p_room_id, option_row.id, actor, p_threshold) returning id into watch_id;
  else
    update public.threshold_watches set threshold = p_threshold, updated_at = now() where id = watch_id;
  end if;
  select count(*) into accept_count from public.responses response
  where response.room_id = p_room_id and response.option_id = option_row.id
    and response.response = 'accept' and response.withdrawn_at is null;
  update public.threshold_watches set triggered_at = now(), updated_at = now()
  where id = watch_id and triggered_at is null and threshold <= accept_count;
  perform private.emit_room_change(p_room_id, 'threshold_watch_changed');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.set_threshold_watch(uuid, uuid, integer) owner to muplaytime_api;

create or replace function public.acknowledge_triggered_watch(p_room_id uuid, p_watch_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.current_member(p_room_id);
  watch public.threshold_watches%rowtype;
begin
  select target.* into watch from public.threshold_watches target
  where target.room_id = p_room_id and target.id = p_watch_id and target.member_id = actor for update;
  if watch.id is null or watch.triggered_at is null then
    raise exception using errcode = '42501', message = 'watch_acknowledge_forbidden';
  end if;
  update public.threshold_watches
  set acknowledged_at = coalesce(acknowledged_at, now()), closed_at = coalesce(closed_at, now()), updated_at = now()
  where id = watch.id;
  perform private.emit_room_change(p_room_id, 'threshold_watch_acknowledged');
  return jsonb_build_object('ok', true);
end
$$;
alter function public.acknowledge_triggered_watch(uuid, uuid) owner to muplaytime_api;

revoke all on function public.create_proposal_with_initial_option(uuid, text, timestamptz, integer, text, timestamp without time zone, text) from public, anon;
revoke all on function public.add_proposal_option(uuid, uuid, timestamptz, integer, text, timestamp without time zone, text) from public, anon;
revoke all on function public.rename_proposal(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_proposal(uuid, uuid) from public, anon;
revoke all on function public.withdraw_proposal_option(uuid, uuid) from public, anon;
revoke all on function public.confirm_proposal_option(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_option_response(uuid, uuid, public.response_choice) from public, anon;
revoke all on function public.set_threshold_watch(uuid, uuid, integer) from public, anon;
revoke all on function public.acknowledge_triggered_watch(uuid, uuid) from public, anon;

grant execute on function public.create_proposal_with_initial_option(uuid, text, timestamptz, integer, text, timestamp without time zone, text) to authenticated;
grant execute on function public.add_proposal_option(uuid, uuid, timestamptz, integer, text, timestamp without time zone, text) to authenticated;
grant execute on function public.rename_proposal(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_proposal(uuid, uuid) to authenticated;
grant execute on function public.withdraw_proposal_option(uuid, uuid) to authenticated;
grant execute on function public.confirm_proposal_option(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_option_response(uuid, uuid, public.response_choice) to authenticated;
grant execute on function public.set_threshold_watch(uuid, uuid, integer) to authenticated;
grant execute on function public.acknowledge_triggered_watch(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'room_change_events'
  ) then
    alter publication supabase_realtime add table public.room_change_events;
  end if;
end
$$;

revoke create on schema public from muplaytime_api;
revoke create on schema private from muplaytime_api;
revoke muplaytime_api from postgres;

commit;
