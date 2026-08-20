# Mobile experience optimization — design

## 1. Design status and decision record

Status: approved and implemented; final verification is in progress. The user explicitly approved the consolidated plan and implementation on 2026-08-20. Production-writing live tests and deployment remain separate release actions.

Confirmed product decision on 2026-08-19: perform a full-flow mobile-native pass covering entry, room shell, overlap board, personal schedule, proposals, reminders, and shared sheets. Preserve backend/domain contracts and desktop functionality.

This design incorporates the original Time Loom direction, the deployed mobile audit in `research/current-mobile-audit.md`, and the user's immediate evidence that schedule deletion was technically possible but practically undiscoverable.

## 2. Objectives, invariants, and non-goals

### Objectives

1. Make every core flow complete and understandable at 320–430 CSS px without a desktop-layout mental model.
2. Preserve MuPlaytime's visual identity: one shared viewer-time axis, status textures, restrained ticket/thread motifs, bilingual typography, and the Rendezvous Shuttle as the signature interaction.
3. Replace hidden or miniature interactions with explicit 44 px touch affordances and one coherent full-height sheet pattern.
4. Make mobile correctness executable through component, real-browser, live two-client, and release evidence rather than viewport screenshots alone.

### Immutable product/data boundaries

- No Supabase migration, schema marker, RPC signature, authorization policy, room identity model, realtime event model, or database privilege change.
- `RoomRepository`, TanStack Query snapshot ownership, canonical refetch after mutation, invite-token tab-memory rules, and anonymous-session behavior remain authoritative.
- The board continues to use `projectBoardDay`, `selectedSegments`, and `summarizeSelection`.
- Schedule edits continue to produce a complete canonical day with `paintInterval`; `unknown` remains absence of a persisted interval.
- Weekly rules remain schedule-zone wall time; proposals remain UTC instants plus the source local tuple; all DST behavior continues through the existing Temporal helpers.
- Proposal, response, option, watch, confirmation, cancellation, and acknowledgement lifecycles remain unchanged.
- Group / My schedule / Proposals remain the three primary room routes. This task does not add a Me/account route.

### Non-goals

- Push/PWA/native-app work, offline writes, background reminders, new identities, swipe-only deletion, a new UI framework, a global state library, or a CSS-system migration.
- Removing intentional time-axis panning. The goal is to confine and explain it, not hide overflow globally.
- Reworking the desktop Time Loom into the mobile proposal-list hierarchy. Desktop may reuse new primitives but keeps its current efficient expanded presentation.

## 3. Experience direction

The mobile product remains **Time Loom / 时间织机**, not a generic card dashboard.

- Cloud, Night, Jade, Coral, Violet, and Gold tokens remain unchanged.
- Free, busy, and unknown retain text/texture in addition to color.
- The display face is limited to wordmark and page-level headings; controls use the bilingual body face; all times use tabular monospace.
- Surfaces remain mostly flat with borders and ruled divisions. Full-height sheets use a violet top rule; proposal summaries retain the ticket cue without excessive nested cards.
- Motion is functional: rail positioning and sheet transitions only. Reduced-motion mode removes smooth scrolling and transitions without delaying state updates.

### Mobile information architecture

```text
Create / Join
    ↓
Room shell
├── Group / 大家
│   ├── one-day, six-page Time Loom
│   └── selected-window detail sheet → proposal-create handoff
├── My schedule / 我的排期
│   ├── Weekly
│   ├── Date override
│   └── Schedule timezone
├── Proposals / 游玩提议
│   ├── proposal summary list
│   └── proposal detail sheet → suggest/action handoff
└── More / 更多 sheet
    ├── current member and full room name
    ├── viewer timezone
    ├── language
    └── share/copy invite
```

No sheet opens another sheet on top. A transition such as Details → Propose transforms or replaces the current sheet in one render.

## 4. Responsive architecture

### Layout ranges

- `<= 480px`: phone composition; formal portrait acceptance at 320, 375, 390, and 430 px.
- `481–840px`: compact/tablet/landscape composition using the same header, bottom navigation, and sheet behavior with wider content.
- `>= 841px`: existing desktop composition.

The JS behavior query is exported from `src/ui/responsive.ts` as `COMPACT_LAYOUT_QUERY = "(max-width: 840px)"`; CSS repeats the required `840px` boundary with a paired contract comment/test. CSS media queries cannot consume a TypeScript constant, so parity is enforced rather than falsely claiming one physical source. CSS handles ordinary reflow; `useMediaQuery` is allowed only where semantics differ, such as desktop inline proposal details versus a modal mobile detail layer.

### Viewport and safe-area tokens

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --mobile-header-min-height: 56px;
  --mobile-nav-min-height: 64px;
  --mobile-nav-block-size: 64px;
  --sheet-viewport-height: 100dvh;
}
```

`index.html` opts into `viewport-fit=cover`. A small Visual Viewport hook updates a CSS fallback variable when the software keyboard changes the usable height. Page roots use `min-height: 100dvh`, not a fixed `100vh`.

Header and navigation values are minimums, never fixed clipping heights. The compact header stays in normal/sticky flow and can grow at large text sizes. A ResizeObserver publishes the bottom navigation's actual rendered block size to `--mobile-nav-block-size`; main padding uses that measured value plus the safe area.

The document must satisfy `scrollWidth <= clientWidth + 1`. Only elements marked `data-intentional-horizontal-scroll` may scroll horizontally. Global `overflow-x: hidden` is forbidden as a repair because it would conceal layout regressions and clip focus rings.

## 5. Shared mobile sheet system

Create `src/ui/ModalSheet.tsx` as the sole modal surface for invite, More, selected-window details, proposal create/suggest/detail, schedule interval edit/delete, and schedule timezone review.

### DOM and behavior contract

- Portal into one static `<div id="modal-root">` outside `#root`; individual sheets never create competing portal roots.
- Backdrop plus one `role="dialog"`, `aria-modal="true"`, accessible title, and visible 44×44 close control.
- Backdrop closes only when `event.target === event.currentTarget`; pointer activity inside never bubbles into close.
- Record the trigger when one exists, choose an explicit initial focus or the close control, contain Tab/Shift+Tab, and support Escape. Cleanup removes inert/body lock before restoring focus. A direct route deep link may have no trigger; in that case the route owner focuses the proposal summary or page heading after close.
- Set the application root inert and lock/restore background scroll. Cleanup is idempotent and StrictMode-safe.
- Header and footer are sticky. The content region owns scrolling with `min-height: 0`, `overflow: auto`, and `overscroll-behavior: contain`.
- Phone editing/detail sheets use the full usable viewport. More may size to content up to `85dvh`. Desktop uses the same primitive as a centered constrained dialog.
- Sticky footer padding includes `--safe-bottom`; current focus and the primary submit button can be scrolled above a keyboard-height viewport.
- At most one dialog exists. Handoffs suppress intermediate focus restoration and transfer focus to the next sheet.

### One room-level sheet host

`RoomPage` renders one `RoomSheetHost` and owns one transient-sheet discriminated union. Feature pages never mount their own `ModalSheet`; they can only request `open`, `replace`, or `close` with a typed descriptor.

```ts
type TransientRoomSheet =
  | { kind: "room-actions" }
  | { kind: "invite" }
  | { kind: "selection-detail"; context: SelectionSheetContext }
  | { kind: "board-time-choice"; context: BoardTimeChoiceContext }
  | { kind: "proposal-form"; context: ProposalFormContext }
  | { kind: "schedule-interval"; context: ScheduleIntervalContext }
  | { kind: "timezone-change"; context: TimezoneChangeContext }
  | null;
```

The descriptor stores only the context/callbacks needed to render the sheet; unsaved form fields live inside the mounted sheet component. `replace` preserves the one-dialog invariant for More → Invite, Selection details → Propose, Proposal detail → Suggest, and detail → destructive-confirmation mode.

The optional proposal id is never copied into sheet state. Every render derives `routeBackedProposalSheet` from the current route id plus a local `ProposalDetailMode`; changing/removing the route id resets that mode to `detail`. `effectiveSheet = transientRoomSheet ?? routeBackedProposalSheet`. A transient handoff therefore takes precedence without creating a second selected-id owner; once it closes, the route-backed detail may resume or the route is returned to the list. The host, not each feature, is the final authority on which sheet is mounted.

`useDialogFocus` is either absorbed into this primitive or extended; Invite and existing proposal-create markup must migrate rather than maintain parallel focus implementations.

## 6. Entry and room shell

### Entry

On phones the hero becomes a compact identity band rather than a 42vh desktop hero:

```text
┌ English / 简体中文 ┐
│ CROSS-TIMEZONE CO-OP
│ MU/PLAYTIME
│ Find the overlap…
│ ━ ━ ━
└────────────────────
  Create a room
  [room]
  [name]
  [timezone]
  [Create]
  Resume previous room
```

- The full wordmark uses container-aware size and can never be clipped.
- The form has `width: 100%; min-width: 0; max-width: 420px` and normal-flow padding.
- Language is 44 px high. Resume moves into document flow after the form instead of absolute page positioning.
- Form controls and error messages remain visible under a reduced 568 px height and a keyboard-height viewport.

### Compact room header and More

```text
┌ MU/PT   Friday crew…   ⋯ ┐
└───────────────────────────┘
```

- At least 56 px content height plus top safe area; it may grow under text scaling.
- Compact `MU/PT` identity on the left, one-line room name in the center, 44×44 More on the right.
- Full room name and `You are {member}` appear first in More; the current identity is no longer silently hidden.
- More then shows viewer timezone with “changes only your view,” language, Share invite, and Copy invite fallback.
- `navigator.share` is progressive enhancement only. Copy remains available, and cancellation is not treated as an error.
- If the ephemeral token is no longer in tab memory, the sheet explains why it cannot reconstruct the link and does not show a mysterious disabled control.
- A successful create or join immediately opens the Invite sheet while the one-time token is present. Share is primary, Copy is the guaranteed fallback, and the copy explains that the link should be saved now. Closing still permits reopening from More until refresh/tab close; afterward More shows the unrecoverable-token explanation.

The bottom navigation keeps the existing three routes and adds safe-area padding. Main content bottom padding equals the rendered navigation plus safe area. A route switch deliberately focuses/scrolls the new main heading; language changes, viewer-zone changes, and sheet close preserve the current route and local feature state.

Connection status sits immediately below the compact header or above the bottom navigation, never at a desktop fixed top coordinate. Offline/reconciling are global; action failure belongs beside the originating control.

## 7. Group Board and Rendezvous Shuttle

### Authoritative selection model

Fix correctness before visual refactoring. Selection state becomes absolute:

```ts
interface InstantRange {
  startEpochMilliseconds: number;
  endEpochMilliseconds: number;
}
```

Add one `validateInstantRange` used by tap, drag, keyboard, fields, day rebase, projection, and proposal handoff. It requires `end > start`, an absolute duration divisible by 30 minutes, and 30–1440 minutes inclusive, preserving the existing full-day/backend capability. Invalid field drafts remain visible with a bilingual inline error but never reach projection or `onPropose`. `ProposalForm` accepts every 30-minute duration through 1440 with common presets plus a step-30 numeric/custom path.

Slot indexes, local inputs, handle percentages, compact summaries, and proposal defaults are derived views. They are never the stored selection identity.

Rules:

1. Initial selection preserves the existing 18:00–20:00 viewer-local default as an absolute range and immediately scrolls it into view; an already-held selection takes precedence on rerender.
2. Drag/tap maps the viewer-day coordinate to a snapped epoch and updates the absolute range. Start/end `datetime-local` drafts first resolve through `localProposalChoices`: zero choices require an explicit valid replacement, two choices require an offset-labeled occurrence, and the authoritative range remains unchanged until each boundary is resolved and validated.
3. A viewer-zone change does not write the range. It changes the board date to the selected start instant's date in the new zone, reprojects labels, and scrolls the unchanged range into view.
4. Previous/next-day is an explicit rebase action: keep the local start clock and the validated absolute duration when it resolves to one occurrence. For a repeated time, the current range remains unchanged until the member chooses an offset-labeled occurrence. For a nonexistent time, it remains unchanged until the member chooses a valid replacement. The choice uses the room-level sheet host; no silent `[0]` choice or post-hoc adjustment is allowed.
5. A range that projects across local midnight stays intact. Add a pure frontend `projectSelectionRange` helper that calls the unchanged `projectBoardDay` for every intersecting viewer civil date, clips/concatenates the segments by epoch, and then feeds the complete list to `summarizeSelection`.
6. Proposal handoff uses the exact range plus the viewer zone at the moment of handoff.

### Four-hour rail

The default one-day board contains six four-hour snap markers: 00–04, 04–08, 08–12, 12–16, 16–20, and 20–24. Scroll snap is `proximity`, not mandatory, so it does not fight handle adjustment. If an unchanged absolute selection crosses the viewer's local midnight, the rail conditionally appends the required adjacent-day four-hour sections so both real handles retain correct coordinates; a strong date divider marks the continuation. A validated 1440-absolute-minute range normally intersects at most two viewer civil dates, but a spring-forward day can make it touch a third date; the projector and rail therefore iterate actual intersecting dates rather than assuming a fixed two-day ceiling.

- First entry shows the page containing now; an existing selection wins and reveals its start around the first third of the viewport.
- All rows share one scroll container. Member labels remain sticky; the time axis remains the viewer zone.
- Four-hour boundary controls provide Previous/Next and a readable current range, so panning is not the only navigation method.
- The aggregate overlap row is one at-least-44-px hit surface. Narrow exact segments become non-interactive visual spans rather than undersized buttons.
- A tap with movement below a small threshold selects the snapped slot; ordinary drag/pan never changes the selection.
- Ordinary rail content relies on native scrolling. Only each 44×44 handle uses pointer capture and `touch-action: none`; pointer cancel/lost capture always cleans up.
- Handle movement is rAF-throttled and snaps at 30 minutes. Start/end have slider semantics and Arrow/Home/End keyboard behavior.

### Selection dock and detail sheet

Below the rail, a persistent mobile dock shows:

```text
18:00–20:00 · minimum 2/5 · range 2–4/5
[View details]              [Propose this time]
```

At 320 px the actions stack; they never shrink below 44 px. A direct aggregate-row selection may open details, while dragging updates the dock without interrupting the gesture.

The selected-window sheet consumes the complete multi-date projection and contains:

- start/end datetime fields and the unchanged UTC identity;
- minimum/range summary, never an average;
- each segment's viewer-zone range;
- free/busy/unknown lists with each member's schedule-zone local date/time as supplementary text;
- a sticky Propose action, including when free count is zero.

Closing restores rail position, focus, and selection. Details → Propose atomically replaces the active descriptor in `RoomSheetHost`.

## 8. Personal schedule

### Mobile section hierarchy

The phone page shows a three-column underline tablist: Weekly / Date override / Timezone. Labels may wrap within >=44 px rows at 320 px; the tablist itself never scrolls horizontally. Only the active section is in the mobile reading order; desktop retains its efficient multi-section view.

Weekly navigation uses 44 px Previous/Next buttons plus the native weekday select. Date override uses a date field and an explicit state label: “Using weekly template” or “This date has its own schedule.”

### Actionable interval rows

Existing intervals become full-width action rows:

```text
18:00–20:00   FREE / 空闲   Edit / 修改
```

The row communicates time, texture, and state, is at least 44 px high, and opens `ScheduleIntervalSheet`. Add time opens the same component in create mode.

Sheet modes:

```ts
type ScheduleIntervalMode =
  | { kind: "create"; scope: DayScope }
  | {
      kind: "edit";
      scope: DayScope;
      openedVersion: number;
      originalFingerprint: ScheduleInterval;
    };
```

The sheet owns only an unsaved draft: start, end, state (`free | busy`), ends-next-day, and an optional adjacent-day segment choice. A stored split segment opens as that day segment with `endsNextDay = false`; only a newly created range or a user-selected adjacent candidate becomes a cross-midnight draft. The sheet previews every affected day before save.

#### Canonical operations

- Create or subrange quick-paint: apply `paintInterval(current, range, state)`.
- Edit the whole selected interval: first clear exactly the original range with `unknown`, then paint the new range/state. This prevents residue when moving or shortening.
- Clear: paint exactly the original range with `unknown`; copy says “Clear this time,” never “set to unknown.”
- Cross-midnight create: split at 1440 and call the existing pair callback atomically.
- Stored cross-midnight parts have no linkage. If a selected boundary touches a same-state adjacent next-day/previous-day part, the sheet may offer “also edit the adjacent segment,” default off, with both ranges shown. It must never infer linkage silently.
- Compile every draft into a pure `ScheduleWritePlan` before enabling Save:

  ```ts
  type ScheduleWritePlan =
    | { kind: "single"; day: DayScope; intervals: ScheduleInterval[] }
    | {
        kind: "orderedPair";
        first: DayScope;
        firstIntervals: ScheduleInterval[];
        second: DayScope;
        secondIntervals: ScheduleInterval[];
      };
  ```

  The pair must be exactly two ordered adjacent weekdays or dates, matching the existing RPC. A previous-adjacent edit anchors previous/current; a next-adjacent or new cross-midnight edit anchors current/next. Any draft that would require previous/current/next or another three-day combination is invalid: Save stays disabled, the UI explains “adjust these in two edits,” and the member may deselect the adjacent part. No pair of RPCs may impersonate one atomic edit.
- For date pairs, materialize each day's base independently from its own override-or-weekly result and explain that a successful pair write creates two complete date overrides. `9999-12-31` cannot produce a next-day plan.
- Clear uses a two-step confirmation inside the same sheet footer. It does not open a nested confirm dialog.
- A version conflict retains the draft and compares `originalFingerprint` with the refreshed saved day. If the exact original no longer exists, one-click retry is disabled; show current versus intended canonical output and require the member to reselect/reconfirm. If it still exists, allow deliberate retry with the latest version. No automatic overwrite, and the sheet component is not keyed by snapshot/version.

### Quick paint

Quick paint remains a convenience, not the only path.

- Choose a brush labeled Free, Busy, or Clear.
- Navigate six four-hour blocks. Each block contains eight 30-minute cells of at least 44×44 px.
- On <=480 px, arrange the eight cells as two rows of four in chronological order; compact/tablet may use one row of eight.
- Cells expose current state in label/text/texture. Tapping appends a local brush operation and derives the canonical draft by reducing those operations through `paintInterval`; a sticky Save submits the complete day once, while Cancel writes nothing. If the base version changes, retain the operation list, show latest saved versus rebased result, and require explicit confirmation before replaying those operations over the latest version. Explicit start/end fields and the interval sheet provide the range path.
- Do not reuse the UTC Board rail: schedule quick paint owns local minutes and must remain schedule-zone wall time.

### Date overrides

On first edit, the existing resolved weekly intervals remain the base sent to the replacement callback, preserving the full-day copy contract. Restore weekly template is an explicit secondary action with an in-context confirmation/feedback state.

### Schedule timezone

The mobile section shows the current anchor and a “Review timezone change” action. The sheet contains:

1. target IANA timezone;
2. two explicit choices: view only / migrate local clock;
3. stacked per-source cards with Before, After, and DST notes;
4. a sticky confirmation action.

The desktop table may remain for >=841 px. Proposal instants are never included. No write occurs before confirmation.

## 9. Proposals and threshold reminders

### Mobile list hierarchy

Mobile assigns each proposal to exactly one scan group, in this priority order:

1. **Attention:** it contains an unacknowledged triggered watch for the current member;
2. **Scheduled:** it is scheduled and its confirmed option starts in the future;
3. **Open:** it remains open;
4. **History:** it is cancelled or its scheduled confirmed time is in the past.

After acknowledgement or lifecycle change, the proposal is re-derived into its next group and never appears twice. Within a group, preserve the snapshot's stable order. History is an explicit disclosure.

Each summary row shows game, status, final time or option count, accept count, creator, and aggregate current-member progress such as “responded to 2 of 3 options · 1 reminder watching,” rather than pretending a multi-option proposal has one response. The row is a 44 px detail entry; the page-level Plan a game action remains visible.

The route is the sole owner of `selectedProposalId`. Add `proposalHash(roomId, proposalId)` and explicit push/replace navigation helpers. `App` passes `route.proposalId` through `RoomPage` into the proposal surface/room sheet host; `ProposalPanel` never mirrors the selected id in local state.

- A list click pushes a proposal hash with a same-room `from-list` history marker, then opens the route-backed detail in `RoomSheetHost`. The underlying list remains mounted and body-lock restoration returns its scroll.
- Browser Back from that entry closes detail naturally.
- A direct deep link has no same-room marker. Close replaces the hash with the proposal list and explicitly focuses the corresponding summary or proposals heading; it must not blindly navigate away from the site.
- An invalid id renders an explanatory not-found detail with Return to list.
- Desktop keeps the expanded ticket list; a route id only focuses/highlights the ticket and never creates a second selected-id state.

### Proposal detail sheet

The sheet reading order is:

1. game, lifecycle state, creator;
2. each option's time/duration/source zone+offset/suggester/final or withdrawn state;
3. current member response controls;
4. response totals;
5. watch/reminder status and custom X control;
6. authorized option actions;
7. proposal-level secondary actions.

Accept / Maybe / Decline are three equal 44 px controls with text, count, border, and selected state. Withdraw response remains explicit. Reminder input and action stack at 320 px; a triggered reminder repeats that the member must still accept manually.

Primary context actions such as Confirm this time remain beside their option. Rename/cancel and destructive secondary actions switch the existing proposal descriptor between `detail | actions | confirm` content modes so they do not compete with response controls or mount another dialog.

### Create and suggest

Proposal create and Suggest another time reuse `ProposalForm` inside the shared full-height sheet. Existing DST gap/fold choices become vertically stacked. Validation or mutation error leaves the draft mounted and reports next to the affected action.

Replace the current fire-and-forget helper with awaited, keyed action state:

```ts
type ActionState = Record<string, { pending: boolean; error: string | null }>;
```

Only the active action is disabled. Realtime refetch does not dismiss a form or discard a threshold draft. The global status region is a fallback, not the only error feedback.

## 10. Status, failure, and offline behavior

| State | Mobile presentation | Action |
|---|---|---|
| app/room loading | compact skeleton or loader with named purpose | wait |
| public configuration/schema mismatch | full-page explanation without secret values | configure/redeploy |
| room service unavailable | retained route plus retry state | Retry |
| all unknown / zero overlap | intact loom plus explanatory copy | go to schedule or still propose |
| empty weekly/date schedule | explicit Unknown explanation | Add time |
| no active proposals, no history | compact empty state | Plan a game |
| no active proposals, history exists | active empty state plus History disclosure | Plan a game / view history |
| saving | originating control shows pending; polite live status | wait |
| saved | short polite live confirmation where useful | none |
| offline | persistent non-covering connection bar; drafts may open but writes are disabled | wait for reconnect |
| checking shared data | derive from `online && query.isFetching && !query.isPending`; do not claim websocket knowledge | automatic canonical refetch |
| mutation failure | inline error beside the operation | retry deliberately |
| schedule conflict | retain draft and show refreshed canonical comparison | review and retry |
| expired/triggered watch | reason/manual-accept reminder | acknowledge/respond |
| invite unavailable after refresh | explain token was intentionally not persisted | use previously saved link |
| invite copied | polite local confirmation | close/share |
| native share cancelled | no error; Copy remains | copy or close |
| native share failed | inline explanation; Copy remains | copy |
| invalid invite vs service error | distinct entry state | return/retry |
| DST repeated/nonexistent input | offset choices or valid replacements; no implicit choice | choose explicitly |

No non-idempotent operation is automatically replayed after reconnect.

## 11. Component and state design

```text
App.tsx
  owns route (including proposalId), viewerTimeZone, ephemeralInvite
  └── RoomPage.tsx
      owns query/realtime/mutation and TransientRoomSheet coordination
      ├── Shell.tsx
      │   └── MobileRoomHeader.tsx
      ├── GroupBoard.tsx
      │   ├── useBoardSelection.ts
      │   ├── BoardTimeRail.tsx
      │   └── SelectionInspector.tsx
      ├── ScheduleEditor.tsx
      │   ├── ScheduleDayEditor.tsx
      │   └── ScheduleQuickPaint.tsx
      ├── ProposalPanel.tsx
      │   ├── ProposalCard.tsx
      │   ├── ProposalOptionCard.tsx
      │   └── ReminderControl.tsx
      └── RoomSheetHost.tsx
          ├── RoomActionsSheet.tsx
          ├── InviteSheet.tsx
          ├── SelectionDetailSheet.tsx
          ├── ScheduleIntervalSheet.tsx
          ├── TimezoneChangeSheet.tsx
          ├── ProposalDetailSheet.tsx
          └── ProposalFormSheet.tsx
              └── ModalSheet.tsx
```

State ownership rules:

- `App`: route (including the sole selected proposal id), viewer zone, and ephemeral invite; no feature drafts or selection.
- `RoomPage` / `RoomSheetHost`: snapshot/realtime/mutation, online state, the only `TransientRoomSheet`, and the detail mode for the descriptor derived from the current route id. Feature callbacks request atomic open/replace/close; only the host mounts `ModalSheet`. The proposal id itself is never copied out of the route.
- `Shell`: presentational navigation and triggers only.
- `GroupBoard`: viewer date; `useBoardSelection` alone owns the absolute range; rail owns only transient pointer/scroll refs. It passes typed context/callbacks to the host and never mounts a sheet.
- `ScheduleEditor`: active mobile section, weekday/date, selected interval descriptor; the host descriptor carries scope/callback context, while the mounted sheet owns unsaved fields.
- `ProposalPanel`: threshold drafts and keyed pending/errors only. The route owns selected proposal; the host resets its route-backed detail content mode whenever that route id changes.
- `ModalSheet`: focus/inert/scroll/viewport mechanics only; it knows no room/domain concepts.

No new mobile UI/draft/scroll data enters localStorage. Language switching rerenders without changing component keys so an in-progress selection or draft is retained.

## 12. File-level impact and reuse boundary

### Expected new files

- `src/ui/ModalSheet.tsx`, `src/ui/responsive.ts`, `src/ui/useMediaQuery.ts`, optional `src/ui/useVisualViewport.ts`
- `src/app/MobileRoomHeader.tsx`, `src/app/RoomSheetHost.tsx`, `src/app/RoomActionsSheet.tsx`, `src/app/RoomStatusRegion.tsx`
- `src/board/useBoardSelection.ts`, `src/board/projectSelectionRange.ts`, `src/board/BoardTimeRail.tsx`, `src/board/SelectionInspector.tsx`, `src/board/SelectionDetailSheet.tsx`
- `src/schedule/compileScheduleWritePlan.ts`, `src/schedule/ScheduleDayEditor.tsx`, `src/schedule/ScheduleQuickPaint.tsx`, `src/schedule/ScheduleIntervalSheet.tsx`, `src/schedule/TimezoneChangeSheet.tsx`
- `src/proposals/ProposalCard.tsx`, `src/proposals/ProposalOptionCard.tsx`, `src/proposals/ProposalDetailSheet.tsx`, `src/proposals/ReminderControl.tsx`, `src/proposals/ProposalFormSheet.tsx`
- targeted component/browser tests and shared test factories/helpers

### Expected modified files

- `index.html`, `src/styles.css`, optionally one `src/mobile.css` imported after base styles
- `src/app/App.tsx`, `RoomPage.tsx`, `Shell.tsx`, `router.ts`, `InviteSheet.tsx`, `useDialogFocus.ts`; route wiring changes to pass proposal id and push/replace detail navigation
- `src/rooms/EntryPages.tsx`, `src/board/GroupBoard.tsx`, `src/schedule/ScheduleEditor.tsx`, `src/proposals/ProposalPanel.tsx`, `ProposalForm.tsx`
- `src/i18n/catalogs.ts` and parity tests
- Vitest/Playwright configs, scripts, CI workflow, and mobile browser/live suites

### Must remain semantically unchanged

- `src/domain/**`, `src/data/**`, `src/realtime/**`, `supabase/**`
- `src/board/projection.ts`, `src/schedule/intervals.ts`, `src/schedule/timezone.ts`, and proposal aggregate helpers except for additional characterization tests

If implementation appears to require a schema/RPC/permission change, stop and split that defect into a separate task; this design has no such dependency.

## 13. Bilingual and accessibility contract

- Localize the hard-coded Entry `CROSS-TIMEZONE CO-OP` and Proposal `MULTI-OPTION RENDEZVOUS` eyebrow copy or remove it from mobile; the Board advisory eyebrow already comes from the catalog.
- Add catalog keys for More, Share invite, Edit time, Clear this time, clear confirmation, weekly-template state, View details, current member, view-only timezone explanation, local-time callout, action retry, and modal handoff labels.
- Catalog parity remains test-enforced. User/member/room/game names and IANA zones are never translated.
- Primary body text is >=16 px; secondary metadata remains >=13 px. At 200% text size, vertical growth is allowed but required controls remain in the reading order.
- Long scan labels may ellipsize only when their full value is available inside the current detail/More sheet and through an accessible name/title.
- All visible interactive targets are >=44×44 px or use a >=44×44 associated label hit area.
- Sheet semantics, keyboard equivalence, slider labels/value text, live-region politeness, non-color state, and reduced motion are hard gates.

## 14. Verification architecture

Use three layers so the full flow is proven without repeating an expensive live backend journey at every width.

### Layer A — Vitest and React Testing Library

- `ModalSheet`: title, focus lifecycle, Escape, inert/scroll cleanup, handoff.
- `GroupBoard`: selection epochs survive viewer-zone rerender; keyboard changes one boundary; proposal handoff receives exact epochs.
- `ScheduleIntervalSheet`: create, whole-interval edit, clear/split, single/ordered-pair compiler, optional adjacent segment, three-day rejection, conflict fingerprint/draft retention, view-only/migrate review.
- `ProposalPanel`: unique grouping, route/detail state, keyed pending/error, response change/withdraw, watch create/change/trigger/acknowledge, rename/cancel/option-withdraw/confirm/final-cancel.
- Entry/Shell: create/join/resume/loading/invalid-invite/service error, immediate invite, Share available/unavailable/cancel/failure, Copy fallback, and expired tab-memory explanation.
- Existing interval/timezone/projection/proposal tests remain characterization gates.

JSDOM tests assert semantics and data flow, not pixel geometry.

Runner ownership is positive and disjoint:

- Vitest: `src/**/*.test.ts` and `src/**/*.test.tsx`.
- Default Playwright: an explicit standard E2E `testMatch`.
- Playwright CT: only `e2e/**/*.ct.spec.tsx` in its own test directory/config.
- Live Playwright: explicit desktop `live.spec.ts` and mobile `live.mobile.spec.ts` ownership.
- Production Playwright: explicit `production.spec.ts` ownership.

Every config declares `testMatch`; no runner relies on another runner's `testIgnore` for correctness. Runner `--list` audits are release gates.

### Layer B — real Chromium mobile component contracts

Add `@playwright/experimental-ct-react` pinned exactly to the existing Playwright version, with an independent config/test directory/script. Verify compatibility with React 19 and Vite 8 before broad test migration. If the adapter is incompatible, stop and use a deterministic standalone test-only Vite harness outside the production entry/build; never add a production route or `VITE_E2E` product branch.

CT mounts presentational entry/feature surfaces with typed factories, injected callbacks, and production CSS. It does not mount `App` or `RoomPage` through Supabase; repository/RPC integration belongs to the live suite. Split a mountable Entry view/form surface from its repository adapter if necessary.

Use two distinct CT projects so a resized mobile context is never mistaken for desktop proof:

- `mobile-contract`: Chromium mobile user agent, touch, and mobile context; tests set the supported phone viewport.
- `desktop-contract`: Desktop Chrome at 1280×720.

The light layout matrix covers:

- 320×568 EN+ZH
- 360×800 EN+ZH
- 375×812 EN+ZH
- 390×844 EN+ZH
- 430×932 EN+ZH
- 812×375 mobile-landscape interaction contract covering compact shell, board pan/handle/dock, schedule interval edit/clear, proposal response/reminder, and sheet focus/reflow
- a separate 1280×720 desktop-contract regression

Shared helpers assert:

- no document overflow and only marked intentional scrollers;
- target rectangles >=44 px;
- handle touch changes only its boundary while rail touch pans only;
- dialog count/focus/background lock/restore;
- safe-area custom-property overrides and keyboard-height viewport visibility;
- long names/zones/counts, error banners, and 200% text-size reflow surrogate;
- Share present/absent/cancel/failure and Copy fallback;
- `prefers-reduced-motion: reduce` with immediate state updates and no smooth-scroll dependency;
- representative axe smoke scans for entry, every room route, and every sheet. Explicit geometry/focus/gesture assertions remain authoritative.

Keep a small deterministic screenshot set for entry, selected board, interval sheet, triggered reminder, keyboard-height sheet, and desktop. Geometry/semantic assertions remain the gate; screenshots are evidence, not a substitute.

The 375×430 reduced-height case is only a software-keyboard surrogate, and root font-size scaling is only a text-scaling surrogate; neither is recorded as physical-device proof.

### Layer C — real Supabase live E2E

One automated serial Playwright suite contains a task-complete journey plus one focused stale-version case. It is invoked only by an explicit release/manual workflow and never by pull-request or ordinary push CI.

The task-complete journey uses one 375 px Chinese client and one 430 px English client to cover create/join, invite token non-persistence, weekly and date-override add/edit/clear, cross-midnight, override restore, both timezone choices with no pre-confirm write, overlap rail/detail, proposal seed, suggested option/withdrawal, response change/withdraw, custom X change/trigger, real proposal hash navigation + `page.goBack()` list scroll/focus restoration + direct-link replace-close, refresh durability, acknowledgement, confirmation then cancellation, and reconnect/refetch.

The focused case caches/intercepts client B's post-initial `get_room_snapshot` responses so B submits a known stale version despite Realtime. After the expected serialization conflict, remove the intercept, refetch canonical state, and prove the draft/fingerprint comparison plus deliberate retry. Run with unique names and no retries.

The live suite targets local or dedicated staging Supabase by default. If only the production Frankfurt project is available, running it requires explicit release authorization, a unique visible test prefix, and acceptance that permanent test rooms cannot currently be cleaned up.

Live traces/screenshots/videos remain off unless invite and credential material can be proven redacted; failure artifacts must not persist raw invite capabilities. Deterministic CT supplies ordinary visual/debug artifacts.

Before claiming platform-complete release acceptance, record physical iOS Safari and Android Chrome evidence with device model, OS/browser version, date, locale, and timezone for create/join, board pan/handle, interval edit/clear, proposal response/reminder, More/invite, and keyboard sheet behavior. If either device is unavailable, record software keyboard, hardware safe area, native picker/share, and mobile screen-reader behavior as unverified residual risk rather than representing emulation as proof.

## 15. Implementation order and gates

1. Add characterization tests plus CT runner scaffolding and positive discovery boundaries for UTC selection preservation and existing domain/desktop paths.
2. Build `ModalSheet`, viewport/safe-area tokens, and browser geometry helpers; migrate Invite and proposal create without changing feature UX.
3. Repair entry, compact shell, More, status region, bottom navigation, and no-overflow baseline.
4. Change board selection authority to absolute instants, then split rail/inspector and add four-hour navigation/detail sheet.
5. Build actionable schedule intervals and canonical edit/clear sheet, then quick paint/date override/timezone review.
6. Build proposal summaries/detail/form/action hierarchy and keyed async errors.
7. Complete the five-width × two-locale light CT matrix, reduced-motion/text-scaling surrogates, both CT projects, the serial live suite, desktop/mobile production-prefix smoke, deterministic screenshots, runner audits, and explicitly qualified physical-device evidence.

Each phase must keep lint, typecheck, unit, component, aggregate Vitest, build, and relevant Playwright runner-discovery gates green. Domain/backend changes are a stop condition.

## 16. Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| Viewer-zone change silently moves the chosen instant | Absolute epoch range is the only selection state; callback assertions compare epochs, not screenshots. |
| Sheet portal makes itself inert or leaks body lock | Portal outside root; reference-counted idempotent cleanup; StrictMode and handoff tests. |
| Keyboard or safe area hides submit/navigation | `100dvh` + VisualViewport fallback + sticky safe-area footer + reduced-height browser contract + real-device pass. |
| Rail pan triggers selection or click | Non-interactive segment paint layer, one hit layer, movement threshold, native pan outside handles, pointer-cancel tests. |
| Whole-interval edit leaves old fragments | Clear original then paint draft; canonical output tests. |
| Cross-midnight adjacency is mistaken for linkage | Never infer; optional explicit adjacent-part selection only. |
| Realtime refetch dismisses mobile drafts | Feature-local sheet/draft state is not keyed to snapshot identity; errors/pending are action-scoped. |
| Mobile hierarchy regresses desktop | Compact semantic branching only where required; desktop smoke and 1280 screenshots in every release gate. |
| Tests become too slow or write production too often | Deterministic CT for width matrix; one serial live suite (journey + conflict) only through an explicit release/manual workflow; local/staging backend by default; runner discovery remains explicit. |
