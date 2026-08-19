# MuPlaytime Implementation Plan

## Preconditions and approval gates

- Keep the Trellis task in `planning` until the user explicitly approves the final planning summary.
- Before product edits, activate the task and load the Phase 2 implementation context.
- Live-verify official package, Supabase, Temporal, GitHub Pages, Action, and font documentation through the project-mandated gstack `/browse` workflow. Its current global upgrade gate requires separate permission if still present.
- Do not create remote repositories, create a Supabase project, apply remote migrations, commit, push, enable Pages, dispatch workflows, or publish the personal-site card without the corresponding authorization and credentials.
- Preserve `.trellis/`, `.agents/`, `.codex/`, and the managed block in `AGENTS.md` when initializing the repository.

## Ordered implementation checklist

### 1. Initialize the local project

- [ ] Initialize Git with `main` locally after task activation; confirm the intended remote name `TheCYPER/MuPlaytime` but do not create/push it yet.
- [ ] Add a root `.gitignore`, README, license decision placeholder, `.env.example`, and Node/tool version files.
- [ ] Scaffold a React + TypeScript Vite app with `/MuPlaytime/` base and hash routing.
- [ ] Pin a supported LTS Node in local metadata and CI rather than using the workstation's Node 25 implicitly.
- [ ] Add lint, format-check, typecheck, unit, component, end-to-end, build, and preview scripts.

### 2. Establish tokens, shell, and bilingual infrastructure

- [ ] Implement the Time Loom global token layer, verified bilingual fonts/fallbacks, focus styles, texture cues, and reduced-motion base.
- [ ] Add English and Simplified Chinese catalogs, browser-language detection, manual persistence, key-parity tests, and localized date/time helpers.
- [ ] Build the responsive route shell, top controls, desktop continuous board region, mobile bottom navigation, full-height sheet primitive, loading/error/empty boundaries, and schema/config error page.
- [ ] Verify the visual direction against `research/ux-time-loom-direction.md`; remove any generic dashboard/card styling that does not encode schedule structure.

### 3. Implement pure domain modules first

- [ ] Define branded ids, decoded domain types, status unions, and exhaustive reducers/transitions.
- [ ] Implement the exact `normalize_name_v1` preview and AC1d vectors: NFC, outer Unicode-White-Space trim, pinned Unicode/ICU root-locale lowercase, no internal collapse/NFKC, first display spelling preserved; keep server output authoritative.
- [ ] Implement minute-based interval canonicalization, paint-and-replace, split/merge, midnight splitting, invalid-range rejection, and full-day snapshot operations.
- [ ] Implement the single local-minute set resolver for weekly rules and overrides: skipped minutes yield no instant, repeated minutes yield both occurrences, `1440` is exclusive next-day, outputs coalesce without zero/reversed intervals, and every affected result is annotated.
- [ ] Reuse that resolver for date snapshots, viewer projection, and keep-anchor/migrate previews; implement concrete proposal input that requires an offset choice for ambiguous times and an explicit valid replacement for nonexistent times.
- [ ] Implement the interval sweep that yields free/busy/unknown member ids, overlap counts, contiguous segments, and advisory ranking.
- [ ] Implement proposal/option/response/watch state projections and localized view models.

### 4. Build and validate the Supabase schema locally

- [ ] Add Supabase configuration and ordered SQL migrations for extensions, enums, tables, composite keys, overlap/uniqueness checks, indexes, one authoritative `schedule_sets.time_zone`, response tombstones, watch close state/reasons, insert-only `room_change_events`, and `schema_meta` including the normalization data version.
- [ ] Create a dedicated `NOLOGIN NOBYPASSRLS` API function-owner role, non-recursive membership helpers, exact internal grants/policies, and fixed-search-path definers; revoke default/anonymous execution and grant only explicit authenticated RPC signatures.
- [ ] Add `normalize_name_v1` plus secure room create/join/name-claim functions with server invite hashing. Existing-name claim must be mapping-only, preserve the first display spelling, and ignore the supplied initial zone rather than rewrite the schedule anchor.
- [ ] Add full-day weekly/override replacement and schedule migration functions with expected-version conflict handling.
- [ ] Add atomic `create_proposal_with_initial_option`, proposal rename/cancel, option add/withdraw, response upsert/tombstone, confirm, watch set/change, and triggered-watch acknowledgement functions. Every state-dependent call derives its actor, locks proposal then option, rechecks state/authority, and inserts a room-change signal in the same transaction; acknowledgement remains allowed after closure and locks the owned triggered watch directly.
- [ ] Serialize response and watch mutations on the option row, recount after the lock/mutation, and trigger newly met watches synchronously so concurrent accepts or watch creation cannot lose a trigger.
- [ ] In option withdrawal, confirmation, and cancellation transactions, expire affected untriggered watches with `option_withdrawn`, `not_selected`, or `proposal_cancelled`; preserve triggered reminders for later acknowledgement and keep untriggered watches active only on the scheduled final option.
- [ ] Enable and test RLS on every exposed table; deny direct mutations owned by RPCs; expose no auth ids or invite digest. Invoke every public RPC as unauthenticated, cross-room, and wrong-member/creator/suggester actors as well as its allowed actor.
- [ ] Publish only authorized `room_change_events` inserts for freshness and write deterministic concurrency tests for confirm versus add/respond/withdraw/cancel, two accepts meeting a threshold, watch creation racing an accept, same-name multi-device claims, and two-room event isolation.

### 5. Add the typed data and realtime layer

- [ ] Configure the browser client from public environment values and establish/restore invisible anonymous auth before room calls.
- [ ] Implement Zod decoders/mappers and typed repositories; no component consumes raw Supabase rows.
- [ ] Implement create/join/claim flow, fragment-token removal, room-id routing, an immediate copy/save prompt, and current-tab in-memory invite handling; assert that raw invites never enter persistent browser storage.
- [ ] Implement TanStack Query keys per room/domain and one Realtime coordinator that listens to room-change INSERT signals and invalidates/refetches every canonical query in that room on any event, reconnect, visibility, online recovery, or ambiguous write; topics are diagnostic only.
- [ ] Add optimistic/conflict states only where rollback is well defined; never show an unconfirmed mutation as saved.

### 6. Deliver the personal and group schedule flows

- [ ] Build the weekly template editor with 30-minute pointer, touch, keyboard, and form-input paths.
- [ ] Build concrete-date editing that snapshots the resolved day, plus `Restore weekly template`.
- [ ] Build viewer-zone controls and the explicit keep-anchor/migrate preview and confirmation flow.
- [ ] Build the group board on one viewer-zone axis with sticky headers, member rows, supplementary member-local callouts, status patterns, numeric `free / total`, inspectable member breakdown, advisory intensity, ranking, and zero-count proposal entry.
- [ ] Implement the Rendezvous Shuttle with UTC anchoring, segment-preserving minimum/range summaries, a mobile breakdown sheet, independently focusable start/end handles, date/time alternatives, drag-versus-pan arbitration, touch targets, and reduced-motion behavior.
- [ ] First establish the date-specific single-week projection, then layer recurring expansion and date snapshots on the same tested domain path; do not ship until both are complete.

### 7. Deliver proposals, responses, and reminders

- [ ] Create proposals from board/personal selections and through explicit date/time fields, including offset-labeled choice for ambiguous local input and explicit valid replacement for nonexistent input.
- [ ] Render parallel options, independent response totals, suggester identity, and per-member accept/decline/maybe controls.
- [ ] Implement creator rename/cancel/confirm, suggester withdrawal, immutable option times, scheduled/cancelled read-only states, and new-proposal rescheduling.
- [ ] Implement custom positive-X watches, presets, above-current-member warning, immediate already-met trigger, durable one-shot state, acknowledgement, and explicit new watch.
- [ ] Render expired untriggered watch reasons, keep triggered reminders acknowledgeable after option/proposal closure, and prevent creation/editing on response-ineligible options.
- [ ] Verify all proposal, response, and reminder changes reconcile across two simultaneous clients.

### 8. Accessibility, resilience, and visual QA

- [ ] Add grid/list semantics, keyboard navigation, live-region messages, non-color state labels/patterns, focus visibility, reduced motion, and contrast checks.
- [ ] Test 1280×720 and 375×812 plus intermediate widths in English and Chinese; fix blocking overflow, sticky-region collisions, touch targets, and sheet focus management.
- [ ] Exercise empty, low-overlap, saving, offline, reconnecting, validation, conflict, service failure, schema mismatch, cancelled, and no-proposal states.
- [ ] Capture desktop/mobile screenshots and critique them against the Time Loom design; spend visual emphasis on the shuttle and overlap weave only.

### 9. Build and prepare GitHub Pages deployment

- [ ] Add a Pages Actions workflow that pins verified actions/Node, installs from the lockfile, runs required checks, builds `dist/`, uploads the artifact, and deploys with safe concurrency.
- [ ] Verify no root-absolute assets, privileged secrets, persisted raw-invite path, or non-Pages routes exist in the production artifact; apply the strictest verified GitHub-Pages-compatible app CSP and ship no third-party runtime scripts.
- [ ] Inventory scripts across the shared `https://thecyper.github.io` origin, document that path prefixes do not isolate the persisted anonymous session, and obtain explicit acceptance of that origin-wide trust before production publication.
- [ ] Serve the production build from an actual `/MuPlaytime/` prefix and test fresh invite, claimed room, refresh, static assets, auth restore, and realtime connectivity.
- [ ] Prepare exact repository variables/secrets and Supabase provisioning instructions for the user.

### 10. Provision and publish through explicit gates

- [ ] With authorization, create/configure the Supabase project, apply migrations, enable anonymous auth and the `room_change_events` Realtime publication, and record browser-safe configuration.
- [ ] With authorization, create `TheCYPER/MuPlaytime`, inspect the exact staged scope, commit on the approved branch, push, enable Pages/workflow settings, and verify the public URL.
- [ ] Run the public two-client smoke flow and all deployment acceptance checks before touching the personal-site publication state.
- [ ] Clone or update `TheCYPER/TheCYPER.github.io` without disturbing unrelated work; add `src/content/projects/mu-playtime.yaml` with the application URL as draft, include `repoUrl` only after separate public-repository authorization, validate/build, then make it non-draft only after the app passes.
- [ ] With separate authorization, commit/push the confirmed personal-site scope and dispatch its manual Pages workflow; verify `/projects/`, the application link, and the repository link only when `repoUrl` is present.

## Validation commands and evidence

Exact script names may be refined during scaffolding, but the final project must provide equivalents for:

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:component
npm run test:e2e
npm run build
```

Database validation must include local migration reset/apply, database lint where supported by the verified CLI, exact normalization vectors, proposal/initial-option rollback injection, the complete public-RPC authorization matrix, insert-event room isolation, terminal watch-state transitions, and deterministic concurrent transition/threshold race tests. Frontend E2E must use at least two browser contexts with different IANA timezones and language preferences.

Production evidence must include:

- asset/network/console checks from `/MuPlaytime/`;
- fresh invite and refresh-safe hash routes;
- a two-room isolation probe;
- a two-client realtime schedule/proposal/response/watch flow including response withdrawal and date-override restoration through INSERT invalidation;
- a cross-domain invalidation probe where join, response-triggered reminder, confirmation, and cancellation each refresh every affected room projection;
- representative Dubai, US, and UK DST cases covering skipped/repeated minute sets, `1440`, ambiguous proposal choice, and nonexistent proposal rejection;
- desktop/mobile screenshots in English and Chinese;
- an artifact scan showing no privileged credential;
- proof that no raw invite is persisted plus a recorded shared-origin script inventory/trust acceptance;
- the personal-site card and successful application link only after app smoke success, plus a successful repository link only when separately authorized and present.

## Risky files and rollback points

- SQL migrations, RLS policies, security-definer authorization, proposal lock order, option serialization, and room-change signaling are the highest-risk boundary. Keep migrations additive, test against a fresh local database, and back up before any destructive remote change.
- `src/schedule/` time/interval code is the second high-risk boundary. It must remain pure and exhaustively unit-tested before UI integration.
- Realtime code must consume insert-only room signals and invalidate/refetch rather than introduce a second state reducer or depend on domain-row DELETE payloads.
- The `/MuPlaytime/` path is not an origin boundary. The raw invite is ephemeral, but the persistent anonymous session remains readable by any compromised same-origin page; moving to a dedicated origin is the rollback/escalation if the explicit trust decision changes.
- Vite base/router and the Pages workflow are a deployment rollback point; validate the built prefix locally before publishing.
- The personal-site YAML is independently reversible and remains draft until public smoke passes.
- If a remote deployment fails, restore the previous verified frontend artifact/commit; prefer a forward database fix to an unsafe down migration.

## Final pre-start gate

- [x] `prd.md` has no blocking questions and passed the lossless convergence read.
- [x] `design.md` covers architecture, data flow, visual direction, compatibility, security, rollout, and rollback.
- [x] `implement.md` contains ordered work, validation, external-write gates, and rollback points.
- [x] `implement.jsonl` and `check.jsonl` contain real spec/research entries and validate.
- [x] An independent planning review has no unresolved critical finding.
- [x] The user has explicitly approved the latest final planning summary in a subsequent message.
- [x] Only then run `task.py start`; do not treat planning approval as GitHub/Supabase publish authorization.
