import { readFile } from "node:fs/promises";

const files = [
  "supabase/migrations/202608180001_schema.sql",
  "supabase/migrations/202608180002_rpc_core.sql",
  "supabase/migrations/202608180003_rpc_proposals.sql",
];

const sql = (
  await Promise.all(files.map((file) => readFile(file, "utf8")))
).join("\n");
const required = [
  "enable row level security",
  "private.current_member",
  "private.emit_room_change",
  "create_proposal_with_initial_option",
  "confirm_proposal_option",
  "set_threshold_watch",
  "acknowledge_triggered_watch",
  "alter publication supabase_realtime add table public.room_change_events",
  "revoke all on function",
  "grant execute on function",
  "private.valid_concrete_option",
  "private.request_auth_uid",
  "private.invite_digest",
  "on conflict (room_id, normalized_name) do nothing",
  "normalization_data_version_mismatch",
  "schedule_version_conflict",
  "replace_weekly_pair",
  "replace_date_override_pair",
  "date '9999-12-31'",
  "grant muplaytime_api to postgres",
  "revoke create on schema public from muplaytime_api",
  "revoke create on schema private from muplaytime_api",
  "revoke muplaytime_api from postgres",
];

for (const contract of required) {
  if (!sql.toLowerCase().includes(contract.toLowerCase())) {
    throw new Error(`Missing SQL contract: ${contract}`);
  }
}

if (
  /grant\s+(?:all|insert|update|delete)[^;]+\s+to\s+(?:anon|authenticated)/i.test(
    sql,
  )
) {
  throw new Error(
    "Direct domain-table mutation grant found for a browser role",
  );
}

if (/auth\.uid\(\)/i.test(sql)) {
  throw new Error(
    "Runtime RPCs must not depend on auth schema USAGE; use private.request_auth_uid",
  );
}

if (/extensions\.gen_random_bytes/i.test(sql)) {
  throw new Error(
    "Runtime token generation must not depend on extensions schema USAGE",
  );
}

if (!/create role muplaytime_api nologin noinherit nobypassrls/i.test(sql)) {
  throw new Error("The dedicated NOBYPASSRLS API owner role is missing");
}

if (
  /grant\s+[^;]*update[^;]*room_change_events[^;]*to\s+muplaytime_api/i.test(
    sql,
  )
) {
  throw new Error(
    "The insert-only room change signal table grants UPDATE to the API role",
  );
}

console.log(
  `Validated ${files.length} migration files and ${required.length} security contracts.`,
);
