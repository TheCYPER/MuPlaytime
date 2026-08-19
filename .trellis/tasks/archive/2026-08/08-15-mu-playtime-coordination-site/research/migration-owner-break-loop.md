# Bug Analysis: Supabase function-owner bootstrap failed only on a real database

## 1. Root Cause Category

- **Category**: D/E — Test Coverage Gap plus Implicit Assumption.
- **Specific cause**: SQL string checks never compiled the PL/pgSQL bodies and
  the design assumed a migration role could transfer function ownership without
  PostgreSQL 17's role-membership and target-schema privilege prerequisites.
  Supabase executes local migrations as reserved role `postgres`; the dedicated
  `muplaytime_api` owner is intentionally `NOLOGIN NOINHERIT NOBYPASSRLS`.

Bayesian investigation started with these hypotheses:

| Hypothesis | Prior | Discriminating evidence | Posterior |
|---|---:|---|---:|
| Migration ran as `supabase_admin` without membership | 45% | An intentional migration probe reported both users as `postgres` | 0% |
| `postgres` lacked `SET` membership in the new owner | 35% | Granting `muplaytime_api` to `postgres` advanced past `must be able to SET ROLE` | 90% |
| Function-owner transfer was fundamentally unsupported | 20% | Transfer succeeded after temporary schema `CREATE` grants | 0% |

## 2. Why Fixes Failed

1. Replacing the reserved `collation` alias fixed the first parser symptom but
   could not expose later owner-transfer failures because the migration stopped
   at the first invalid statement.
2. Granting the API role to `supabase_admin` followed an incorrect mental model;
   Supabase protects that reserved role and rejected the membership change.
3. Granting the API role to the actual `postgres` migrator satisfied `SET ROLE`,
   but PostgreSQL also requires a prospective function owner to have `CREATE`
   on the containing schema.
4. Granting `CREATE` on only `public` missed functions under `private`; both
   application schemas belong to the same owner-transfer contract.
5. Static checks accepted an inline PL/pgSQL `CASE` condition that PostgreSQL 17
   rejected. Replacing it with weekday modular arithmetic made the expression
   unambiguous.
6. The first pgTAP assertion expected no `pg_auth_members` row. PostgreSQL 17
   correctly retains an ADMIN-only creator row with `SET` and `INHERIT` disabled;
   the security property is the options, not row absence.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
|---|---|---|---|
| P0 | Integration test | Run `supabase db reset` on the pinned PostgreSQL major before any remote push | Done |
| P0 | Privilege test | Assert `muplaytime_api` cannot be set/inherited and cannot create in either schema | Done |
| P0 | Architecture | Keep temporary role/schema grants inside migrations 001–003 and revoke them at the end | Done |
| P1 | Documentation | Record Supabase/PostgreSQL 17 owner-bootstrap semantics in backend code-spec | Done |
| P1 | Review checklist | Probe `current_user`/`session_user` and test owner-transfer prerequisites | Done |

## 4. Systematic Expansion

- **Similar issues**: every future migration that creates an API-owner function
  must either reuse the established owner bootstrap or append a narrowly scoped
  grant/revoke pair; direct `ALTER ... OWNER` is not portable by itself.
- **Design improvement**: privilege assertions test effective `SET`, `INHERIT`,
  `BYPASSRLS`, and schema-creation powers rather than role-catalog shape.
- **Process improvement**: SQL static contracts remain a fast preflight, but
  fresh migration compilation and pgTAP are release blockers.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/backend/supabase-contracts.md`.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- [x] Added applied-migration privilege assertions.
- [x] Recorded this root-cause analysis with the active task.
- [x] Checked for `src/templates/markdown/spec/`; this product repository has no
      Trellis source-template tree, so template synchronization is not applicable.
