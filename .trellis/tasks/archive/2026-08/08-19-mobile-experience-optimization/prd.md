# Mobile experience optimization

## Status

Implementation and verification in progress. The full-flow breadth in **D1** was confirmed on 2026-08-19, and the user approved implementation on 2026-08-20. Production-writing live tests, merge, and deployment remain separate release actions.

## Goal

Make MuPlaytime feel intentionally designed for phones rather than like a compressed desktop timetable. A member using a 320–430 px wide touch device must be able to create or join a room, understand overlap, edit and correct their schedule, create or respond to a game proposal, manage a threshold reminder, and recover from errors without hidden gestures, clipped content, or desktop-only controls.

The mobile work must preserve the existing Time Loom visual identity, bilingual behavior, timezone/domain semantics, room security model, and deployed GitHub Pages/Supabase architecture.

## Evidence and problem statement

- A live check on 2026-08-19 found the entry wordmark visibly clipped at 375 px. At 320 px, entry form controls extend to 335 px and create horizontal page overflow.
- The shipped room shell already has a three-destination bottom navigation and mobile-height sheets, and core controls generally use 44 px minimum targets. These are foundations, not proof that the end-to-end flows are comfortable on touch.
- The group board still renders a roughly 980 px desktop-derived loom inside a horizontal scroller. Its selection, pan, sticky labels, detail disclosure, and timezone controls need task-level mobile validation.
- Existing schedule intervals are static labels. Correcting or deleting one requires manually re-entering its range and discovering that the `unknown` state means “erase”; this is especially opaque on a phone.
- Proposal cards retain dense administrative, response, option, reminder, and lifecycle controls. They require a deliberate mobile information hierarchy rather than only narrower CSS grids.
- Current automated mobile evidence is limited to language/config checks and a Pixel 5 create-room smoke. It does not cover complete mobile schedule, overlap, proposal, response, reminder, error, or overlay flows.
- The original product contract already requires complete mobile join, schedule-edit, overlap-view, proposal, option-response, and reminder flows; a one-day board, bottom navigation, full-height sheets, independently operable selection handles, and an accessible selected-window breakdown were the prior design direction.

## Users and jobs

Primary user: a friend in a small trusted room, holding their phone in portrait orientation and often checking or adjusting plans quickly between classes, work, or travel.

Primary jobs:

1. See where several friends overlap, in the viewer's timezone, without mistaking the count for a guarantee.
2. Add, replace, correct, or remove personal free/busy time with obvious touch interactions.
3. Turn a candidate window into a game proposal, vote on options, suggest another time, and manage “remind me at X” without losing context.
4. Change language or viewer timezone, invite a friend, and recover from saving/offline/conflict states from any mobile route.

## Requirements

### R1. Mobile entry and room shell

- The create, join, resume, loading, invalid-invite, and connection-configuration states must fit without horizontal clipping at supported phone widths.
- Primary form controls must remain at least 44 CSS px tall, labels must stay visible, and the focused field must not be obscured by the software keyboard or fixed navigation.
- In-room navigation must keep the three main destinations persistently reachable with a clear active state and safe-area-aware bottom spacing.
- Room identity remains understandable while language, viewer timezone, and invite actions are available without turning the header into a multi-row control wall.
- After a successful create or join, the one-time invite sheet opens immediately while the raw token is still present in tab memory. It offers Share when supported plus Copy fallback, can be reopened from More until refresh/tab close, and explains why the link cannot be recovered afterward.
- Saving, offline, reconnection, and mutation-failure messages must not cover the current task or bottom navigation and must remain readable with large text.

### R2. Mobile overlap board

- Mobile defaults to one viewer-zone day and preserves a single spatial time axis in the viewer timezone.
- Member labels, time context, overlap strength, and selected-window boundaries remain understandable while the time rail pans horizontally.
- A touch gesture beginning on a selection handle changes only that boundary. A gesture beginning elsewhere pans the rail and does not unexpectedly alter the selection.
- Start and end remain available through explicit date/time fields; the two handles remain independently focusable and keyboard-operable.
- Every board selection is a valid absolute range: end after start, a duration in 30-minute increments, and 30–1440 minutes inclusive, preserving the existing full-day capability. Tap, drag, keyboard, fields, day rebase, multi-date projection, and proposal handoff all use the same validation contract. Ambiguous or nonexistent start/end field values require the same explicit occurrence/replacement choice as proposal entry before the authoritative range changes.
- Selecting a window exposes a mobile detail surface with segment-by-segment counts and free/busy/unknown member lists. The summary uses minimum and observed range, never an average.
- The member detail surface and proposal action must be reachable for zero-, partial-, and full-overlap windows without implying guaranteed attendance.
- Changing viewer timezone preserves the selected UTC instants; it only reprojects their displayed local date and time.

### R3. Mobile personal schedule editing

- Existing weekly and date-override intervals must be actionable objects rather than static labels: a member can select an interval and clearly choose edit/replace or delete/clear.
- Deleting must use user-facing “delete/clear schedule” language. The storage concept of `unknown` may remain internal but must not be the only discoverable deletion path.
- Editing an interval pre-fills its stored day-segment start, end, and free/busy state. Because stored cross-midnight edits are split across days without linkage, the editor must not claim they are one interval; when a boundary-touching adjacent candidate exists, it may offer an explicit default-off option to edit both displayed segments together. New cross-midnight ranges still use the existing pair-write behavior.
- Quick painting remains available, but it must not require accurately tapping a dense 48-column desktop strip. A touch-friendly time-range interaction and explicit fields must provide equivalent results.
- Weekly template, concrete-date override, restore-template, cross-midnight, conflict, validation, and timezone-migration flows remain complete on mobile.
- Destructive actions require deliberate confirmation or an immediately reversible path and must never silently erase adjacent unaffected intervals.

### R4. Mobile proposals and reminders

- Proposal cards establish a scan order of game/status, candidate options, own response, aggregate response, reminder, and creator/suggester actions.
- The member can create a proposal, add a time option, accept/maybe/decline/withdraw, set or change a custom positive threshold, acknowledge a triggered reminder, and perform authorized rename/cancel/withdraw/confirm actions on a phone.
- Dense secondary controls may move into disclosure regions or sheets, but current state and the next primary action remain visible without opening every region.
- Date/time, source timezone/offset, suggester, response totals, withdrawn/cancelled/final state, and threshold reachability warnings remain explicit and bilingual.
- Proposal creation and option suggestion use a keyboard-safe mobile sheet with a visible close path, retained form context on validation errors, and no clipped DST ambiguity/gap choices.

### R5. Sheets, overlays, and navigation state

- Invite, proposal entry, selected-window detail, schedule interval edit/delete, timezone migration preview, and other overlays follow one coherent mobile sheet pattern.
- Each modal sheet traps focus, has an accessible name and explicit close action, supports Escape where a keyboard exists, restores focus to its trigger, and prevents background interaction.
- A sheet opened from a route preserves that route and the underlying selection/scroll position after close; language or viewer-zone switching must not discard an in-progress selection without warning.
- Nested modal stacks are avoided. If one task hands off to another, the first sheet closes or transforms while maintaining a clear Back/Cancel path.

### R6. Responsive, bilingual, and accessible behavior

- Supported portrait widths are 320, 360, 375, 390, and 430 CSS px. The key flows must also remain usable in landscape and at 200% browser text zoom/reflow.
- The UI must not create page-level horizontal scrolling. Purposeful horizontal panning is restricted to labeled time rails whose sticky/context elements remain usable.
- English and Simplified Chinese must both fit without truncating action meaning; member names, room names, game names, long IANA zones, and large counts must wrap or truncate with an accessible full value.
- Touch targets are at least 44 by 44 CSS px with adequate separation. Status is never communicated only through color; focus is visible; reduced-motion preferences are respected.
- Fixed elements account for `env(safe-area-inset-*)`, on-screen keyboards, and dynamic mobile viewport height.

### R7. Quality and compatibility

- Existing desktop behavior at 1280 px remains functionally intact; this task is not a desktop visual redesign.
- No schedule, timezone, proposal, reminder, realtime, authorization, or persistence semantics change unless a separately documented defect requires it.
- Mobile acceptance is tested through task-complete flows, not screenshot-only or create-room-only smoke tests.
- Visual regression evidence is captured at representative English and Chinese phone widths, and browser tests cover touch/pointer arbitration, overlays, focus restoration, and no unintended horizontal overflow.

## Out of scope

- Native iOS/Android apps, app-store packaging, push notifications, email/SMS reminders, and background execution.
- New authentication, room administration, member removal, invite rotation, or backend domain redesign.
- A general desktop redesign or a replacement of the Time Loom visual direction.
- Changing the 30-minute product granularity or the advisory meaning of overlap counts.
- Offline editing or installable-PWA scope beyond the current reconnect/refetch behavior.

## Acceptance criteria

These criteria describe the confirmed full mobile scope.

- [ ] **AC1 — Entry/reflow:** At 320×568, 360×800, 375×812, 390×844, and 430×932, English and Chinese create/join/resume states have no clipped text, overlapped controls, or page-level horizontal overflow; a user can complete create/join with the software keyboard and reach the room. Create/join immediately exposes the one-time Share/Copy invite sheet, and its reopen-before-refresh / unavailable-after-refresh states are explicit.
- [ ] **AC2 — Shell/navigation:** On every room route, the active destination, room context, invite action, language, and viewer-zone action are reachable; fixed UI respects bottom safe area and does not obscure focused controls, banners, or final content.
- [ ] **AC3 — Board/pan:** On a touch-capable 375 px viewport, dragging either 44×44 selection handle changes only that boundary, dragging elsewhere pans without changing the selected instants, and explicit start/end fields provide the same 30-minute result. The shared validator accepts 30- and 1440-minute boundaries and rejects reversed, non-30-minute, and >1440-minute ranges before projection or proposal handoff with a bilingual inline error; field-level DST gaps/folds never select the first occurrence silently.
- [ ] **AC4 — Board/details:** A selected multi-segment window opens an accessible mobile detail sheet showing each segment's free count/range and free/busy/unknown names; close restores focus and scroll/selection, and the window can seed a proposal even at zero free.
- [ ] **AC5 — Schedule correction:** From an existing interval on both weekly and date-override views, a user can open an edit surface, change any subrange/state, or explicitly delete/clear it. Refresh shows the canonical split/preserved result; deletion is not discoverable only through an `unknown` option.
- [ ] **AC6 — Schedule completeness:** Cross-midnight editing, restore-template, schedule conflict recovery, and both timezone-change choices are completable at 320–430 px without clipped previews, ambiguous destructive actions, or inaccessible controls.
- [ ] **AC7 — Proposal lifecycle:** On a touch-capable 375 px viewport, users can create a multi-option proposal, suggest a time, respond/change/withdraw, set custom X, see/acknowledge a durable trigger, and perform every authorized lifecycle action; dense secondary actions do not hide current state or the primary next action.
- [ ] **AC8 — Overlay/accessibility:** Every modal mobile sheet has focus containment/restoration, accessible title/close, background blocking, Escape support, safe-area/keyboard-aware height, and no nested modal trap. A keyboard-only run can complete the equivalent core actions.
- [ ] **AC9 — Bilingual/content stress:** English and Simplified Chinese layouts pass with long room/member/game names, a long IANA zone, two-digit member/response counts, validation errors, offline/saving banners, and 200% text zoom without loss of action meaning.
- [ ] **AC10 — Regression and evidence:** Automated component and Playwright coverage includes every deterministic AC1–AC9 interaction contract plus a no-page-overflow assertion at 320/360/375/390/430 px; unit/type/lint/build checks pass and desktop core flows remain green. Platform-specific software-keyboard, hardware-safe-area, native picker/share, and mobile-screen-reader behavior requires dated physical-device evidence before claiming platform-complete acceptance; if a device is unavailable, it is recorded explicitly as unverified residual risk rather than represented as emulation proof.

## Product decisions

### D1. Breadth of this mobile task — confirmed 2026-08-19

**Decision:** Mobile-native full-flow pass. Cover entry, shell, overlap board, schedule editing, proposals/reminders, and shared sheet behavior as one coherent experience. The user explicitly accepted the higher implementation and test cost in exchange for completing the existing mobile product contract and avoiding incompatible one-off fixes.

## Constraints and risks

- The horizontal time axis is intrinsically wide; eliminating all horizontal movement would damage time readability. The design must distinguish intentional rail panning from accidental page overflow.
- Fixed bottom navigation, full-height sheets, software keyboards, browser chrome, and safe areas compete for limited vertical space.
- Moving controls into disclosures can improve scanability but can also hide state or authorized actions; the hierarchy requires content-stress and lifecycle testing.
- Editing/delete affordances must preserve the existing interval replacement, cross-midnight atomicity, and version-conflict behavior rather than introducing client-only partial writes.
- Real mobile browser behavior differs from desktop viewport emulation. Final verification needs touch-enabled Playwright profiles and a manual responsive/browser pass.

## Planning artifacts

- `prd.md`: current product contract and decision log.
- `research/`: current-state code, test, and responsive-browser evidence.
- `design.md`: completed planning draft covering mobile information architecture, interaction states, component boundaries, data invariants, and validation strategy.
- `implement.md`: completed ordered execution and quality-gate plan.
- `implement.jsonl` / `check.jsonl`: curated and validated spec/research context manifests.
