begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'muplaytime_api') then
    create role muplaytime_api nologin noinherit nobypassrls;
  end if;
end
$$;

-- Supabase migrations run as the reserved postgres role. PostgreSQL requires
-- role membership before that migrator can transfer
-- function ownership to the deliberately non-login API owner. Migration 003
-- revokes this temporary membership after every function has been created.
grant muplaytime_api to postgres;
grant usage, create on schema public to muplaytime_api;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage, create on schema private to muplaytime_api;

do $$
begin
  if not exists (
    select 1 from pg_collation where collname = 'muplaytime_root' and collnamespace = 'public'::regnamespace
  ) then
    execute 'create collation public.muplaytime_root (provider = icu, locale = ''und'', deterministic = true)';
  end if;
end
$$;

create type public.schedule_state as enum ('free', 'busy');
create type public.proposal_status as enum ('open', 'scheduled', 'cancelled');
create type public.response_choice as enum ('accept', 'decline', 'maybe');
create type public.watch_close_reason as enum ('option_withdrawn', 'not_selected', 'proposal_cancelled');

create table public.schema_meta (
  singleton boolean primary key default true check (singleton),
  schema_version text not null,
  normalization_version text not null,
  created_at timestamptz not null default now()
);

insert into public.schema_meta (singleton, schema_version, normalization_version)
values (
  true,
  '2026081801',
  'postgres-icu-root:' || coalesce(
    (select pg_collation_actual_version(oid) from pg_collation where collname = 'muplaytime_root' and collnamespace = 'public'::regnamespace),
    'unknown'
  )
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null check (char_length(room_name) between 1 and 80),
  invite_digest bytea not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, invite_digest)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 80),
  normalized_name text not null check (char_length(normalized_name) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (room_id, id),
  unique (room_id, normalized_name)
);

create table public.member_sessions (
  room_id uuid not null,
  member_id uuid not null,
  auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, auth_user_id),
  foreign key (room_id, member_id) references public.members(room_id, id) on delete restrict
);
create index member_sessions_member_idx on public.member_sessions (room_id, member_id);

create table public.schedule_sets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  member_id uuid not null,
  time_zone text not null check (char_length(time_zone) between 1 and 100),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, id),
  unique (room_id, member_id),
  foreign key (room_id, member_id) references public.members(room_id, id) on delete restrict
);

create table public.weekly_intervals (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  schedule_set_id uuid not null,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  state public.schedule_state not null,
  foreign key (room_id, schedule_set_id) references public.schedule_sets(room_id, id) on delete cascade,
  check (end_minute > start_minute),
  exclude using gist (
    schedule_set_id with =,
    iso_weekday with =,
    int4range(start_minute, end_minute, '[)') with &&
  )
);
create index weekly_intervals_room_idx on public.weekly_intervals (room_id, schedule_set_id, iso_weekday);

create table public.date_overrides (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  schedule_set_id uuid not null,
  local_date date not null check (
    isfinite(local_date)
    and local_date between date '0001-01-01' and date '9999-12-31'
  ),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, id),
  unique (schedule_set_id, local_date),
  foreign key (room_id, schedule_set_id) references public.schedule_sets(room_id, id) on delete cascade
);

create table public.date_override_intervals (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  date_override_id uuid not null,
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  state public.schedule_state not null,
  foreign key (room_id, date_override_id) references public.date_overrides(room_id, id) on delete cascade,
  check (end_minute > start_minute),
  exclude using gist (
    date_override_id with =,
    int4range(start_minute, end_minute, '[)') with &&
  )
);
create index date_override_intervals_room_idx on public.date_override_intervals (room_id, date_override_id);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  created_by_member_id uuid not null,
  game_name text not null check (char_length(game_name) between 1 and 120),
  status public.proposal_status not null default 'open',
  confirmed_option_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (room_id, id),
  foreign key (room_id, created_by_member_id) references public.members(room_id, id) on delete restrict,
  check ((status <> 'scheduled') or (confirmed_option_id is not null)),
  check ((status <> 'open') or (confirmed_option_id is null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table public.proposal_options (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  proposal_id uuid not null,
  suggested_by_member_id uuid not null,
  starts_at timestamptz not null check (
    isfinite(starts_at)
    and starts_at between timestamptz '0001-01-01 00:00:00+00'
      and timestamptz '9999-12-31 23:59:59.999999+00'
  ),
  duration_minutes integer not null check (duration_minutes between 15 and 1440),
  source_time_zone text not null check (char_length(source_time_zone) between 1 and 100),
  source_local_start timestamp without time zone not null check (
    isfinite(source_local_start)
    and source_local_start between timestamp '0001-01-01 00:00:00'
      and timestamp '9999-12-31 23:59:59.999999'
  ),
  source_offset text not null check (source_offset ~ '^(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$'),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, id),
  unique (room_id, proposal_id, id),
  unique (proposal_id, starts_at, duration_minutes),
  foreign key (room_id, proposal_id) references public.proposals(room_id, id) on delete restrict,
  foreign key (room_id, suggested_by_member_id) references public.members(room_id, id) on delete restrict
);

alter table public.proposals
  add constraint proposals_confirmed_option_fk
  foreign key (room_id, id, confirmed_option_id)
  references public.proposal_options(room_id, proposal_id, id)
  deferrable initially deferred;

create table public.responses (
  room_id uuid not null,
  option_id uuid not null,
  member_id uuid not null,
  response public.response_choice not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, option_id, member_id),
  foreign key (room_id, member_id) references public.members(room_id, id) on delete restrict,
  foreign key (room_id, option_id) references public.proposal_options(room_id, id) on delete restrict
);
create index responses_active_option_idx on public.responses (room_id, option_id, response) where withdrawn_at is null;

create table public.threshold_watches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  option_id uuid not null,
  member_id uuid not null,
  threshold integer not null check (threshold > 0),
  triggered_at timestamptz,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  close_reason public.watch_close_reason,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, id),
  foreign key (room_id, member_id) references public.members(room_id, id) on delete restrict,
  foreign key (room_id, option_id) references public.proposal_options(room_id, id) on delete restrict,
  check ((close_reason is null) or (closed_at is not null)),
  check ((acknowledged_at is null) or (triggered_at is not null))
);
create unique index threshold_watches_one_current_idx
  on public.threshold_watches (room_id, option_id, member_id)
  where acknowledged_at is null and closed_at is null;

create table public.room_change_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete restrict,
  topic text not null check (char_length(topic) between 1 and 80),
  created_at timestamptz not null default now()
);
create index room_change_events_room_id_idx on public.room_change_events (room_id, id desc);

alter table public.schema_meta enable row level security;
alter table public.rooms enable row level security;
alter table public.members enable row level security;
alter table public.member_sessions enable row level security;
alter table public.schedule_sets enable row level security;
alter table public.weekly_intervals enable row level security;
alter table public.date_overrides enable row level security;
alter table public.date_override_intervals enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_options enable row level security;
alter table public.responses enable row level security;
alter table public.threshold_watches enable row level security;
alter table public.room_change_events enable row level security;

grant select on public.schema_meta to authenticated;
grant select on public.members, public.schedule_sets, public.weekly_intervals,
  public.date_overrides, public.date_override_intervals, public.proposals,
  public.proposal_options, public.responses, public.threshold_watches,
  public.room_change_events to authenticated;

grant select, insert, update on public.rooms, public.members, public.member_sessions,
  public.schedule_sets, public.weekly_intervals, public.date_overrides,
  public.date_override_intervals, public.proposals, public.proposal_options,
  public.responses, public.threshold_watches to muplaytime_api;
grant select, insert on public.room_change_events to muplaytime_api;
grant delete on public.weekly_intervals, public.date_overrides,
  public.date_override_intervals to muplaytime_api;
grant usage, select on all sequences in schema public to muplaytime_api;
grant select on public.schema_meta to muplaytime_api;

create policy schema_meta_read on public.schema_meta for select to authenticated using (true);
create policy schema_meta_api_read on public.schema_meta for select to muplaytime_api using (true);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'rooms', 'members', 'member_sessions', 'schedule_sets', 'weekly_intervals',
    'date_overrides', 'date_override_intervals', 'proposals', 'proposal_options',
    'responses', 'threshold_watches', 'room_change_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to muplaytime_api using (true) with check (true)',
      target_table || '_api_all',
      target_table
    );
  end loop;
end
$$;

commit;
