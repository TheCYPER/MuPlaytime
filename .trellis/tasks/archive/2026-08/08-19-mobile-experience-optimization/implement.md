# Mobile experience optimization — implementation plan

## Execution status

The user approved this plan and implementation on 2026-08-20. Product implementation is complete and under final verification. This review does not run production-writing live tests or authorize merge/deployment; physical iOS Safari and Android Chrome evidence remains a documented release residual.

## Preconditions and approval gate

- Keep this task in `planning` until the user approves the final consolidated PRD/design/implementation summary in a subsequent message.
- Do not treat the user's choice of full-flow scope as implementation approval.
- Before product edits, run the Trellis start/before-dev workflow, load the frontend and testing specs from the curated context files, confirm `main` is clean/synchronized, and create a `codex/` feature branch.
- This task is frontend-only. Any need for a Supabase migration, RPC signature, authorization change, schema version, invite persistence change, domain lifecycle change, or time/interval algebra change is a stop condition and must become a separate defect/task.
- Do not merge, push to `main`, dispatch Pages, write production Supabase data, or deploy without the later release authorization appropriate to that action.

## Delivery strategy

Implement in reviewable vertical phases. Each phase must preserve desktop core behavior and leave the repository green before the next phase. Correctness boundaries—UTC selection, canonical interval output, focus/inert cleanup, and proposal mutation feedback—land with characterization tests before broad visual overrides.

## Phase 1 — Characterization and mobile test foundation

- [ ] Add a `RoomSnapshot` factory with deterministic long-content, schedule, proposal, response, and watch fixtures under `src/test/`; keep it test-only and domain-shaped.
- [ ] Add a current-behavior characterization and a committed `it.todo` describing the target board viewer-zone epoch invariant. Enable the target regression only together with the Phase 4 fix; no phase may commit a known red test.
- [ ] Extend current schedule tests to distinguish whole-interval move/shorten from subrange paint, explicit clear, canonical split/merge, and cross-midnight pair output.
- [ ] Characterize desktop entry, shell, board, schedule, and proposal primary actions before component splitting.
- [ ] Add `@playwright/experimental-ct-react` pinned exactly to the existing Playwright version, its React/Vite adapter, production CSS bootstrap, explicit `testDir`/`testMatch`, and named mobile/desktop contract projects behind `test:browser:mobile`. Verify React 19/Vite 8 compatibility first; if incompatible, stop and use a standalone test-only Vite harness outside the production entry rather than adding a product test route.
- [ ] Add `@axe-core/playwright` at an exact lockfile version and representative axe browser scans for entry, each room route, and each shared sheet; keep explicit focus/geometry/gesture assertions as the authoritative contract.
- [ ] Update `tsconfig.node.json`, ESLint/project discovery, and every Playwright config so Vitest, default E2E, CT, desktop live, mobile live, and production suites each declare a disjoint positive `testMatch`; no runner may rely on another config's `testIgnore`.
- [ ] Add `e2e/helpers/mobile.ts` with `expectNoDocumentOverflow`, intentional-scroller discovery, 44 px target checks, touch-drag, usable-viewport, one-dialog, and focus-containment helpers.
- [ ] Add lightweight layout fixtures for 320×568, 360×800, 375×812, 390×844, and 430×932 in English and Chinese, plus an 812×375 mobile-landscape interaction project and a separate Desktop Chrome 1280×720 project; do not connect them to Supabase.
- [ ] Split a mountable Entry view/form surface from the repository adapter as needed so CT uses typed callbacks/factories rather than fake Supabase or a production feature flag.
- [ ] Keep `npm test` as the aggregate Vitest boundary and add the mobile browser-contract suite to PR CI without enabling production-writing live tests.

### Phase 1 gate

- Existing tests remain green; the UTC target is tracked as `it.todo` until it is enabled and fixed atomically in Phase 4.
- Runner `--list` output shows no cross-collection.
- CT can mount the real styles and deterministic components at every target viewport.

## Phase 2 — Shared sheet, viewport, and safe-area infrastructure

- [ ] Add `viewport-fit=cover` and safe-area/dynamic-viewport CSS variables.
- [ ] Add one static `#modal-root` outside `#root` and implement `ModalSheet` with accessible dialog title, explicit close, sticky header/content/footer, background inert, idempotent scroll lock, Tab containment, Escape, optional trigger restoration, and correct unlock-before-focus cleanup.
- [ ] Implement `RoomSheetHost` as the sole coordinator. It owns only `TransientRoomSheet`; every render derives any route-backed proposal descriptor from `route.proposalId` plus a local detail mode, then resolves one effective sheet. Feature pages request typed open/replace/close operations, never copy the proposal id into sheet state, and never mount their own modal.
- [ ] Extend/replace `useDialogFocus` without leaving two focus-management implementations.
- [ ] Add the Visual Viewport fallback and compact-layout media hook; keep general layout in CSS.
- [ ] Support atomic sheet replacement without an intermediate focus jump and assert cleanup under React StrictMode, including direct deep links with no trigger and route-owner focus fallback.
- [ ] Migrate Invite and current proposal-create overlay to `ModalSheet` before changing their content.
- [ ] Add native Share progressive enhancement to Invite while retaining copy and the current ephemeral-token explanation/security boundary.
- [ ] Preserve immediate Invite opening after both create and join, reopen from More while the token remains in tab memory, and explicit unavailable-after-refresh behavior.
- [ ] Add sheet unit and real-browser tests for initial focus, loop, Escape, backdrop targeting, inert root, scroll restore, reduced viewport height, safe-area footer, and handoff.

### Phase 2 gate

- Invite and proposal create behave the same on desktop.
- At 320×568 and a 375×430 keyboard-height surrogate, required fields/submit/close remain reachable.
- Exactly one dialog exists during every handoff and all body/root mutations are restored after close.

## Phase 3 — Entry, compact room shell, More, and status region

- [ ] Repair entry container math so form descendants use `min-width: 0; width: 100%`; move Resume into normal flow.
- [ ] Replace the phone hero sizing with a compact container-aware band; preserve the full wordmark and Time Loom threads without clipping.
- [ ] Make language and all entry actions at least 44 px and verify create/join error/keyboard states in English and Chinese.
- [ ] Build `MobileRoomHeader` with compact wordmark, one-line room name, and 44 px More trigger; keep the existing desktop top bar at >=841 px.
- [ ] Build `RoomActionsSheet` with current identity, full room name, viewer timezone explanation/control, language, and invite/share handoff.
- [ ] Keep Group / My schedule / Proposals as the bottom routes; use minimum rather than fixed heights, observe the rendered nav block size, and use that measured value plus safe area for main-content compensation at 200% text.
- [ ] Make route changes deliberately focus/scroll the new main heading rather than inheriting an accidental document offset; preserve state on language/zone changes and sheet close.
- [ ] Add `RoomStatusRegion`: global offline status never covers the header/nav; derive “Checking shared data” only from `online && query.isFetching && !query.isPending` rather than claiming websocket state; action errors remain local.
- [ ] Make offline behavior explicit: drafts may be opened/edited, but write submission is disabled until recovery; no automatic replay.
- [ ] Localize/remove hard-coded English eyebrow text and add all new More/share/status catalog keys with parity tests.

### Phase 3 gate

- Entry and every shell state pass no-document-overflow at 320/360/375/390/430 in both locales.
- Compact layout remains active through 840 px, including 812×375 landscape; 841 px desktop boundary has no cliff.
- Long room/member/zone names and 200% text remain actionable.

## Phase 4 — Board correctness and mobile Time Loom

- [ ] Introduce `InstantRange` and `useBoardSelection`; make absolute epochs the only authoritative selection state.
- [ ] Add shared `validateInstantRange` requiring end-after-start, 30-minute duration increments, and 30–1440 absolute minutes, preserving the existing full-day/backend capability. Use it before every projection/proposal handoff and surface bilingual inline errors; give ProposalForm common presets plus a step-30 custom duration path through 1440.
- [ ] Resolve both start/end `datetime-local` drafts through `localProposalChoices`. A gap requires an explicit valid replacement and a fold requires an offset-labeled occurrence; neither zero nor two choices may mutate the authoritative range until the user resolves it.
- [ ] Separate explicit day rebase from viewer-zone reprojection. Zone changes update labels/date/scroll only and must not alter epochs. Repeated/nonexistent target-day times leave the range unchanged until an offset occurrence or valid replacement is explicitly chosen through the room sheet host.
- [ ] Add pure `projectSelectionRange`: call the unchanged day projector for every viewer date intersecting the range, clip/concatenate by epoch, and summarize the full result.
- [ ] Preserve cross-local-midnight ranges without clipping. Default to six four-hour sections; conditionally append adjacent-day sections so both handles keep real coordinates and show a clear date divider.
- [ ] Extract `BoardTimeRail`, `SelectionInspector`, and `SelectionDetailSheet` while continuing to consume existing projection/overlap helpers.
- [ ] Add six four-hour markers, readable previous/next range controls, proximity snap, current/selected initial positioning, and shared row scroll.
- [ ] Keep sticky member labels and a single viewer-zone spatial axis; add member-local date/time only as supplementary detail text.
- [ ] Replace undersized overlap segment buttons with non-interactive visual spans plus one >=44 px aggregate hit layer.
- [ ] Implement gesture arbitration: native pan outside handles, pointer capture only on each 44 px handle, movement threshold for tap, rAF update, pointer-cancel/lost-capture cleanup, and no auto-scroll during drag.
- [ ] Preserve independent keyboard sliders and explicit datetime fields.
- [ ] Add the persistent selection dock and room-hosted detail sheet with complete multi-date segment lists, minimum/range, free/busy/unknown names, and zero-overlap proposal handoff.
- [ ] Ensure Details → Propose atomically replaces the effective sheet with a transient proposal-form descriptor and passes the exact selected epochs/source zone.
- [ ] Add component/CT tests for 30/1440 boundaries, reversed/non-step/>1440 rejection, UTC preservation, explicit DST gap/fold choices for both day rebase and start/end fields, viewer-zone date change, multi-date cross-midnight projection (including a 1440-minute range touching three civil dates across spring-forward), dynamic rail extension, initial reveal, handle versus pan, tap threshold, keyboard parity, detail focus/restore, and proposal payload.

### Phase 4 gate

- The original UTC selection bug has a passing regression test.
- At 375×812, default/current selection and both handles are reachable without guessing where they are.
- Touch pan never changes selection; handle drag never changes rail scroll; explicit fields produce the same range.

## Phase 5 — Personal schedule hierarchy and explicit correction

- [ ] Add mobile Weekly / Date override / Timezone underline tabs while preserving desktop multi-section presentation.
- [ ] Extract a controlled `ScheduleDayEditor` used by both weekly and date-override scopes.
- [ ] Convert static interval chips into >=44 px action rows with full time/state and an Edit action.
- [ ] Implement room-hosted `ScheduleIntervalSheet` create/edit modes with prefilled stored day-segment fields, original fingerprint/opened version, result preview, cross-midnight control, inline clear confirmation, local pending/error, and retained draft. Stored split segments default to single-day; adjacent composition is always explicit.
- [ ] For whole-interval edit, clear the original range then paint the draft; for quick/subrange paint, paint only the chosen range; for clear, paint unknown only across the selected original.
- [ ] Add pure `compileScheduleWritePlan` returning only `single | orderedPair`; require strictly adjacent ordered days and reject/explain any previous/current/next three-day plan instead of chaining RPCs.
- [ ] Materialize both date-pair bases independently from override-or-weekly state, preview that both full-day overrides will be written, and preserve the year-9999 next-day prohibition.
- [ ] Reuse existing single/pair callbacks and expected version. On conflict, keep the draft and compare the original fingerprint to refreshed canonical state; if it changed/disappeared, disable one-click retry until the member reselects/reconfirms.
- [ ] Never infer a cross-midnight linkage. Offer an explicit, default-off previous or next adjacent-part selection only when a boundary-touching same-state part exists, show both affected ranges, and keep the compiled plan within two days.
- [ ] Build `ScheduleQuickPaint` with Free / Busy / Clear brushes and six four-hour blocks; render eight 30-minute >=44 px cells as two rows of four on phones and one row on compact/tablet. Taps append local brush operations and derive a canonical draft; sticky Save writes the complete day once and Cancel writes nothing. On base-version change, retain/rebase the operation log over latest canonical state only after explicit diff review.
- [ ] Keep explicit start/end input as the equivalent range path and keep quick paint schedule-zone/local-minute based.
- [ ] Preserve first-date-edit full-day copy and add explicit date-override state/restore feedback.
- [ ] Move timezone choice/preview/confirmation into `TimezoneChangeSheet`; render stacked Before/After/DST cards on compact layout and keep the desktop table.
- [ ] Add localized Edit, Clear, confirmation, current-template/override, adjacent-part, conflict/retry, and timezone-review copy.
- [ ] Add unit/component/CT tests for create/edit/move/shorten/clear in both weekly and date-override scopes, preserved adjacent fragments, ordered-pair compilation, three-day rejection, optional adjacent part, two independently materialized date bases, year-9999, fingerprint conflict retention, quick-paint draft/save/cancel plus operation-log rebase, targets, and stacked timezone review.

### Phase 5 gate

- A member can tap any existing weekly or override interval and explicitly modify or clear it; `unknown` is no longer the only discoverable deletion label.
- Canonical results persist through refresh in a live local/remote environment without changing schedule RPC contracts.
- Every schedule flow fits 320–430 px and keeps its primary action reachable under the keyboard surrogate.

## Phase 6 — Proposal list/detail, reminders, and action feedback

- [ ] Extract `ProposalCard`, `ProposalOptionCard`, and `ReminderControl`; keep response/watch domain projections centralized in current helpers.
- [ ] Build mutually exclusive mobile grouping priority: unacknowledged triggered-watch Attention, future Scheduled, Open, then cancelled/scheduled-past History. Show per-option response/watch progress rather than one ambiguous “my response”; desktop keeps the expanded ticket layout.
- [ ] Make the existing route the sole selected proposal owner: add `proposalHash` plus push/replace helpers, pass `proposalId` App → RoomPage → RoomSheetHost, derive the route-backed descriptor on every render, reset detail mode when the route id changes, and never mirror the id in `ProposalPanel` or transient-sheet state.
- [ ] Mark same-room list pushes so browser Back closes detail and restores the still-mounted list. For direct links, Close replaces to the list and focuses the summary/heading instead of navigating away. Invalid ids show a recoverable state.
- [ ] Keep option time/source/suggester/lifecycle, own response, totals, reminder state, and primary action in the documented reading order.
- [ ] Make response controls equal >=44 px targets with non-color selected state; stack threshold input/action at 320 px.
- [ ] Repeat that a triggered threshold is only a reminder and still requires manual acceptance.
- [ ] Keep Confirm in option context; transform the current proposal descriptor between `detail | actions | confirm` for rename/cancel/destructive actions rather than mounting nested dialogs.
- [ ] Replace inline Suggest time with `ProposalFormSheet`; reuse it for create and suggest while preserving DST gap/fold draft/error behavior.
- [ ] Remove fire-and-forget error swallowing. Add keyed pending/error state, disable only the active action, keep draft/watch input through refetch, and render failure next to its origin.
- [ ] Add component/CT coverage for grouping, detail route/back, invalid id, all response states, threshold above member count, triggered/expired watches, confirmation/cancellation/withdrawal permissions, pending/error retention, and one-dialog handoffs.

### Phase 6 gate

- One compact viewport can complete create, suggest, respond/change/withdraw, set X, observe/acknowledge, confirm/cancel, and return to the list without hidden 36 px actions or stacked dialogs.
- Existing desktop proposal tests and the desktop live two-client lifecycle remain green.

## Phase 7 — Cross-flow content stress, accessibility, and resilience

- [ ] Audit all new/changed controls for accessible name, DOM reading order, focus visibility, 44 px target or label hit area, non-color state, and reduced motion.
- [ ] Verify long 80-character room/member/game values, a long IANA zone, two-digit counts, DST notes, loading/config/schema/service states, empty weekly/date/active-proposal states, invite copied/unavailable/share cancel/failure, cancelled/expired/triggered states, connection/error banners, and both catalogs.
- [ ] Test 200% text reflow at 320/375 and a reduced-height keyboard surrogate; permit vertical scrolling but not loss of actions.
- [ ] Run the 812×375 landscape interaction contract across the compact shell, board pan/handle/selection dock, weekly and date-override interval edit/clear sheets, proposal detail response/reminder controls, and sheet focus/reflow. This is a functional compact-layout gate, not a screenshot-only smoke.
- [ ] Verify sheet close preserves selection and underlying scroll, route change uses deliberate focus/scroll, and language switch retains current draft/selection.
- [ ] Check that only declared Time Loom rails can scroll horizontally on compact layouts; mobile schedule tabs wrap and timezone previews stack. Do not add global overflow clipping.
- [ ] Run representative axe scans, reduced-motion behavior, route/back focus+scroll restoration, Share present/absent/cancel/failure, and Copy fallback.
- [ ] Capture the deterministic screenshot set defined in `design.md` and perform a visual critique against Time Loom rather than accepting generic mobile cards.

### Phase 7 gate

- PR mobile browser-contract suite, unit/component tests, and desktop regression pass.
- No critical accessibility or responsive geometry defect remains in the supported matrix.

## Phase 8 — Live integration, release evidence, and documentation

- [ ] Add one serial automated `e2e/live.mobile.spec.ts` suite using a 375 px Chinese client and 430 px English client with unique names. Trigger it only through an explicit release/manual command or workflow, never PR/ordinary push CI.
- [ ] Cover room create/join, invite non-persistence/share fallback, weekly and date-override add/edit/clear, cross-midnight, override restore, view-only/migrate timezone confirmation, overlap selection/detail, proposal seed/suggest/option-withdraw, response change/withdraw, custom X change/trigger, proposal detail hash + `page.goBack()` scroll restoration + direct-link replace-close, refresh durability, acknowledgement, confirmation then cancellation, and reconnect/refetch.
- [ ] Add a focused same-name two-context schedule-version conflict case. Intercept/cache client B's post-initial snapshot so it deterministically submits the stale version; after the expected conflict, remove interception, refetch canonical state, and prove fingerprint/draft review plus deliberate retry.
- [ ] Target local or dedicated staging Supabase by default. If only production Frankfurt is available, obtain explicit authorization, use a visible unique prefix, and document that undeletable test rooms remain.
- [ ] Keep live trace/screenshot/video artifacts disabled unless raw invites can be proven redacted; do not trade debug convenience for persisted capabilities.
- [ ] Add a non-writing configured production mobile smoke under `/MuPlaytime/` and retain the desktop production-prefix smoke.
- [ ] Keep Pages CI split: PR runs aggregate/split Vitest, default E2E, and both CT projects; non-PR rebuilds the final configured artifact after any unconfigured test build and then runs desktop plus true-mobile-context production smoke. Live remains a separate explicit workflow.
- [ ] Before claiming platform-complete acceptance, record an iOS Safari and Android Chrome pass with device/OS/browser/date/locale/timezone. If either device is unavailable, mark keyboard, hardware safe area, native picker/share, and mobile screen reader as unverified residual risk rather than blocking or overstating emulation.
- [ ] Update README or release documentation with the supported mobile matrix and manual live-test command if implementation is approved.
- [ ] Run Trellis check and an independent code/experience review. Resolve every P0/P1 or explicitly block the task.

### Phase 8 gate

- Every PRD AC has an evidence row.
- No product bundle contains a test route/backdoor, privileged secret, or raw-invite persistence.
- Production build and configured prefix smoke pass; deployment remains a separate authorized action.

## Required validation commands

Exact new script names may be refined once CT configuration is installed, but the final repository must provide and run equivalents of:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:unit
npm run test:component
npm run test:browser:mobile
npm run test:e2e -- --list
npm run test:browser:mobile -- --list
npm run test:e2e -- --project=desktop
npm run test:db:static
npm run build
```

After every test command that may overwrite `dist`, production verification rebuilds the configured artifact immediately before smoke:

```bash
VITE_SUPABASE_URL=... \
VITE_SUPABASE_PUBLISHABLE_KEY=... \
VITE_SCHEMA_VERSION=... \
VITE_NORMALIZATION_VERSION=... \
npm run build

VITE_SCHEMA_VERSION=... \
VITE_NORMALIZATION_VERSION=... \
npm run test:e2e:production
```

Release-only live writes, with browser-safe environment and explicit authorization:

```bash
npm run test:e2e:live
npm run test:e2e:live:mobile
```

Runner discovery checks must prove:

- Vitest collects only `src/**/*.test.ts(x)`.
- Default Playwright collects only default `e2e` specs.
- CT collects only `*.ct.spec.tsx` component-browser specs, with distinct mobile/desktop projects.
- Live desktop/mobile and production configs collect only their named suites; list audits use the required public environment without performing writes.

## Acceptance evidence map

| PRD AC | Primary evidence |
|---|---|
| AC1 | Entry CT width/locale matrix + live create/join |
| AC2 | Shell CT, safe-area/keyboard-height assertions, route navigation |
| AC3 | Board unit/CT touch-pointer-keyboard contracts |
| AC4 | Board detail sheet CT + live proposal seed |
| AC5 | Schedule canonical component tests + live refresh round trip |
| AC6 | Existing pure time tests + schedule CT + live override/conflict/migration |
| AC7 | Proposal component/CT states + live two-client lifecycle |
| AC8 | ModalSheet unit/CT + keyboard-only journey |
| AC9 | portrait matrix, long-content/200% checks, bilingual screenshots, device record |
| AC10 | all runner gates, desktop regression, prefix smoke, final Trellis check |

## High-risk review points and rollback

- **UTC selection:** reject any effect that rewrites selection from slot indexes after viewer-zone changes. Roll back the board visual phase while retaining the tested absolute-range fix if needed.
- **Modal infrastructure:** portal/inert/body-lock bugs can freeze the whole app. Migrate one overlay at a time and retain a commit boundary before removing legacy focus code.
- **Schedule edit:** whole-interval edit, subrange paint, cross-midnight pair, and optional adjacent segment are separate operations. Roll back the sheet UI without touching the stable interval/RPC layer.
- **Proposal refactor:** preserve final-option response eligibility and triggered-watch acknowledgement after closure. Keep extracted components pure and revert hierarchy independently if the desktop/live lifecycle regresses.
- **CSS:** never fix overflow with document clipping. Keep entry/shell/board/schedule/proposal phases separable and validate the 840/841 boundary plus desktop after each.
- **Test tooling:** pin CT to the existing Playwright version. If the CT adapter cannot integrate without destabilizing build/lint, stop and document the blocker before introducing a production test seam.

## Final pre-start checklist

- [ ] `prd.md` reflects the confirmed full-flow scope and has no unresolved blocking decision.
- [ ] `design.md` passes independent UX, technical, and test-plan review.
- [ ] `implement.md` incorporates all P0/P1 review findings and preserves the frontend-only boundary.
- [ ] `implement.jsonl` and `check.jsonl` contain real spec/research entries and validate.
- [ ] The final summary states goal, scope, exclusions, ACs, key decisions, risks, and artifact paths.
- [ ] The user explicitly approves that latest final summary in a subsequent message.
- [ ] Only then run `task.py start` and begin Phase 1.
