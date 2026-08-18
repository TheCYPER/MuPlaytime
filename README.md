# MuPlaytime

MuPlaytime is a bilingual, timezone-aware coordination loom for a small group of
friends. It shows explicit free-time overlap as an estimate, lets anyone suggest
parallel game times, keeps votes attached to immutable options, and creates a
durable in-app reminder when a user-selected number of people accept.

The frontend is a static React/Vite project site for
`https://thecyper.github.io/MuPlaytime/`. Supabase supplies anonymous sessions,
Postgres persistence, RLS, atomic RPCs, and room-scoped Realtime invalidation.
There is no custom server and no login UI.

## Local frontend

Use the Node version in `.nvmrc`:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Only browser-safe values belong in `VITE_*`. Never add a service-role key,
database password, GitHub token, or invite digest. Without the public Supabase
configuration the app deliberately renders a setup error instead of silently
falling back to device-local shared data.

After applying migrations, call `get_schema_meta` and copy its exact
`normalization_version` into `VITE_NORMALIZATION_VERSION`. The app refuses to
start if the deployed ICU normalization data version and bundle expectation
diverge.

## Local Supabase

Install a compatible Supabase CLI and Docker, then run:

```bash
supabase start
supabase db reset
supabase test db
```

Anonymous sign-ins are enabled by `supabase/config.toml`. Migrations create a
dedicated `NOLOGIN NOINHERIT NOBYPASSRLS` function owner, composite room foreign
keys, RLS on every exposed table, atomic proposal/watch RPCs, and the insert-only
`room_change_events` Realtime publication. Browser roles can read only rooms they
have claimed and cannot mutate domain tables directly.

When Docker or the CLI is unavailable, `npm run test:db:static` still checks the
highest-value migration contracts. It is not a replacement for applying the
migrations and running the adversarial two-room test matrix.

## Quality commands

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:component
npm run test:db:static
npm run test:e2e
npm run test:e2e:live
npm run build
npm run test:e2e:production
```

The default Playwright suite rebuilds an intentionally unconfigured artifact and
serves it from the actual `/MuPlaytime/` prefix. `test:e2e:live` requires the four
public `VITE_*` values and exercises two isolated clients against Supabase.
`test:e2e:production` serves the already-built final artifact and verifies its
anonymous-auth and schema handshake before Pages upload. Install Chromium once
with `npm run test:e2e:install`.

## Security and identity limits

- The invite token is a permanent room capability. The database stores only its
  SHA-256 digest; the raw token is returned once and kept only in tab memory.
- A matching normalized name intentionally claims the existing member. This is
  trusted-group convenience, not authentication.
- There is no room owner, invite rotation, member removal, or self-service room
  deletion in the MVP. A leaked invite means abandoning that room.
- Every page under `thecyper.github.io` shares one browser origin. A compromised
  same-origin page can read the persisted anonymous session. A dedicated origin
  is the isolation upgrade.
- GitHub Pages cannot set a `frame-ancestors` response header from this repository.
  Put the site behind a configurable edge host if clickjacking protection is a
  deployment requirement; a meta CSP cannot provide that directive.
- Realtime signals only freshness. Every signal, reconnect, online event, and
  visible-tab recovery refetches the canonical room snapshot.

## Deployment gates

No remote repository, Supabase project, migration, Pages configuration, commit,
push, workflow dispatch, or personal-site edit is performed by local setup. Before
the first deployment:

1. Verify official package documentation and the pinned GitHub Action revisions.
2. Review Supabase region, quotas, anonymous-auth abuse controls, and retention.
3. Apply migrations to a fresh project and pass database isolation/concurrency tests.
4. Configure repository variables listed in `.env.example` (the publishable key is public).
5. Run the two-client public smoke flow before adding the personal-site project card.

See the approved product and architecture artifacts under
`.trellis/tasks/08-15-mu-playtime-coordination-site/` for the full contracts.
