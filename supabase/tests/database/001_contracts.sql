begin;
select plan(27);

select has_table('public', 'room_change_events', 'room change signal table exists');
select has_table('public', 'threshold_watches', 'durable watches exist');
select has_function('public', 'create_room', array['text', 'text', 'text'], 'create_room RPC exists');
select has_function('public', 'join_room', array['text', 'text', 'text'], 'join_room RPC exists');
select has_function('public', 'create_proposal_with_initial_option', array['uuid', 'text', 'timestamp with time zone', 'integer', 'text', 'timestamp without time zone', 'text'], 'atomic proposal RPC exists');
select has_function('public', 'set_threshold_watch', array['uuid', 'uuid', 'integer'], 'watch RPC exists');
select has_function('public', 'acknowledge_triggered_watch', array['uuid', 'uuid'], 'watch acknowledgement RPC exists');
select has_function('private', 'valid_concrete_option', array['timestamp with time zone', 'text', 'timestamp without time zone', 'text'], 'concrete proposal source validation exists');
select has_function('private', 'invite_digest', array['text'], 'narrow invite hashing wrapper exists');
select has_function('private', 'request_auth_uid', array[]::text[], 'JWT subject helper exists without auth schema dependency');
select has_function('public', 'restore_date_override', array['uuid', 'date', 'integer'], 'stale-safe override restore RPC exists');
select has_function('public', 'replace_weekly_pair', array['uuid', 'smallint', 'smallint', 'integer', 'jsonb', 'jsonb'], 'atomic cross-midnight weekly RPC exists');
select has_function('public', 'replace_date_override_pair', array['uuid', 'date', 'date', 'integer', 'jsonb', 'jsonb'], 'atomic cross-midnight override RPC exists');
select is((select relrowsecurity from pg_class where oid = 'public.members'::regclass), true, 'members RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.member_sessions'::regclass), true, 'session mapping RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.responses'::regclass), true, 'responses RLS enabled');
select is((select rolbypassrls from pg_roles where rolname = 'muplaytime_api'), false, 'API owner cannot bypass RLS');
select is((select rolsuper from pg_roles where rolname = 'muplaytime_api'), false, 'API owner is not superuser');
select is(
  coalesce((
    select bool_or(membership.set_option or membership.inherit_option)
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where granted_role.rolname = 'muplaytime_api' and member_role.rolname = 'postgres'
  ), false),
  false,
  'migrator cannot SET or inherit the API owner after migration'
);
select is(
  has_schema_privilege('muplaytime_api', 'public', 'CREATE'),
  false,
  'API owner cannot create public schema objects after migration'
);
select is(
  has_schema_privilege('muplaytime_api', 'private', 'CREATE'),
  false,
  'API owner cannot create private schema objects after migration'
);
select is(
  has_schema_privilege('muplaytime_api', 'extensions', 'USAGE'),
  false,
  'API owner has no broad extension schema access'
);
select is(
  has_function_privilege('muplaytime_api', 'private.invite_digest(text)', 'EXECUTE'),
  true,
  'API owner can execute only the narrow invite hashing wrapper'
);
select is(has_table_privilege('muplaytime_api', 'public.room_change_events', 'UPDATE'), false, 'change events are insert-only to API owner');
grant muplaytime_api to postgres;
set local role muplaytime_api;

select pg_catalog.set_config('muplaytime.test_concrete_good', private.valid_concrete_option(
  timestamptz '2026-08-18 12:00:00+00', 'UTC', timestamp '2026-08-18 12:00:00', 'Z'
)::text, true);
select pg_catalog.set_config('muplaytime.test_concrete_bad_local', private.valid_concrete_option(
  timestamptz '2026-08-18 12:00:00+00', 'UTC', timestamp '2026-08-18 13:00:00', 'Z'
)::text, true);
select pg_catalog.set_config('muplaytime.test_concrete_bad_year', private.valid_concrete_option(
  timestamptz '10000-01-01 00:00:00+00', 'UTC', timestamp '10000-01-01 00:00:00', 'Z'
)::text, true);

reset role;
revoke muplaytime_api from postgres;

select is(current_setting('muplaytime.test_concrete_good'), 'true', 'consistent concrete source metadata is accepted');
select is(current_setting('muplaytime.test_concrete_bad_local'), 'false', 'inconsistent concrete source metadata is rejected');
select is(current_setting('muplaytime.test_concrete_bad_year'), 'false', 'timestamps outside the four-digit client contract are rejected');

select * from finish();
rollback;
