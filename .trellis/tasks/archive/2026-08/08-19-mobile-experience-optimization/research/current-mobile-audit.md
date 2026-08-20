# Current mobile experience audit

Date: 2026-08-19

Scope: read-only inspection of the deployed entry page, current React/CSS implementation, automated tests, and the archived MuPlaytime mobile product/design contract. The audit did not create production rooms or mutate external data.

## Live responsive evidence

The public entry route was inspected through the mandated gstack browser workflow.

| Viewport | Result |
|---|---|
| 375×812 | No document scroll width increase, but the `MU/PLAYTIME` heading is visibly clipped by the hero's overflow boundary. The language select is 38 px high. |
| 320×568 | `documentElement.scrollWidth` is 335 px. Entry inputs/select/button extend from x=24 to x=335 and create 15 px of page-level horizontal overflow. The wordmark remains clipped. |

The issue is structural rather than a browser anomaly: `.entry-page` has a 320 px minimum second column, `.entry-form` subtracts a fixed 3 rem from width, and the mobile hero uses a viewport-relative wordmark size while hiding overflow.

## Foundations worth preserving

- The product already uses the Time Loom palette, status textures, bilingual catalogs, tabular time typography, visible focus, and reduced-motion overrides.
- The room shell already exposes Group, My schedule, and Proposals through a fixed mobile bottom navigation.
- The Group Board already projects a single viewer-timezone day and has independently focusable 44 px shuttle handles, pointer capture, keyboard adjustments, and equivalent datetime-local inputs.
- Invite and proposal-create overlays already use a focus-management hook with initial focus, Tab containment, Escape, and trigger focus restoration.
- Mobile response buttons already form a three-column grid, and core form controls generally use a 44 px minimum height.
- Domain interval replacement, timezone resolution, proposal lifecycle, threshold watches, realtime refetch, room boundaries, and invite-token memory rules are tested and should not be reimplemented in this task.

## Critical correctness gap

The Group Board stores its selection as slot indexes relative to the currently projected viewer-zone day. Changing the viewer timezone recomputes the projection range while retaining the same indexes, which silently changes the selected UTC instants. A proposal created afterward can therefore use a different real time than the member selected.

The mobile design must make absolute start/end instants the selection source of truth. Local fields, slot indexes, handle positions, and four-hour page position are projections of those instants.

## Mobile usability gaps

### Shell and viewport

- Below 760 px the top bar becomes three or more rows containing the wordmark, room name, timezone, language, and invite controls. The claimed member identity disappears entirely.
- There is no compact overflow/More surface, safe-area padding, dynamic viewport unit, software-keyboard treatment, or body-scroll lock.
- Bottom navigation uses a fixed 64 px height and matching padding without `safe-area-inset-bottom`.
- Connection banners use a desktop top offset and can overlap the taller mobile header.
- Bottom-navigation route changes reuse the document's previous scroll offset accidentally; a long schedule route can leave a shorter destination scrolled past its meaningful content.

### Group Board

- The mobile loom remains a roughly 980 px desktop-derived grid with an 870 px timeline. It is one continuous 24-hour scroll rather than six navigable four-hour sections.
- The default 18:00–20:00 selection is offscreen because the scroller starts at midnight and never scrolls the selection into view.
- Narrow overlap segments remain buttons as small as roughly 18 px; exact-minute segments can be smaller.
- A selection breakdown is a native `<details>` that only becomes visually full-screen after manual expansion. It is not a dialog and has no focus containment, explicit close, focus restoration, or inert background.
- The breakdown uses viewer time only and does not provide the member-local time callouts required by the Time Loom design.

### Personal schedule

- Existing intervals are static list items. A member cannot tap one to prefill an edit or reveal an explicit delete action.
- Deletion is implemented correctly but hidden: reconstruct the interval, select `unknown`, then submit. This is a discoverability failure, especially on a phone.
- The 48 quick-paint cells are 18 px wide. Under the mobile two-column form override, the fieldset does not span both columns and becomes even less usable.
- Quick paint supports clicks but not a true touch-drag paint path.
- Weekly template, date override, and timezone migration remain three long desktop sections. The migration preview is a 760 px minimum table inside a horizontal scroller.

### Proposals and reminders

- Every proposal, option, response group, watch, history item, and administrative action is expanded in one long route.
- Suggest-time opens another inline form inside the ticket rather than a keyboard-safe full-height sheet.
- Confirm, withdraw, rename, cancel, and close use 36 px text-button targets.
- Async action failures are swallowed locally and represented only by one global mutation banner; no option-level pending/error state tells the member what failed or what can be retried.
- The router already parses an optional proposal id, but the application does not use it to provide a mobile list-to-detail layer.

## Test gap

- The exact 375×812 Playwright test only checks language switching on the unconfigured state.
- The configured Pixel 5 test covers create room, capture/close invite, group heading, and bottom navigation.
- The complete two-client proposal/response/watch flow runs only in desktop Chrome.
- There is no browser coverage for mobile join/share, schedule create/edit/clear, cross-midnight editing, override restore, viewer-zone selection preservation, handle-versus-pan arbitration, selected-window sheet, timezone migration, proposal detail, soft keyboard, safe area, landscape/intermediate width, 200% text reflow, or page overflow.
- There is no Group Board component interaction test. Schedule component tests focus on domain-integrated behaviors rather than the mobile interaction layer; Proposal Panel tests cover only the empty CTA; Invite Sheet tests cover the existing focus lifecycle only.

## Confirmed direction

The user selected a full-flow mobile-native pass. The new design will:

- retain Group / Schedule / Proposals as the three primary routes;
- use a compact room header plus a More sheet for identity, viewer timezone, language, and invite;
- divide the one-day loom into six scroll-snap four-hour sections and initially reveal current/selected time;
- preserve UTC selection across viewer-zone changes;
- use one shared accessible sheet primitive for selection detail, interval editing, proposal creation/suggestion/detail, invite, and timezone review;
- make interval edit and clear directly discoverable while reusing canonical paint-and-replace operations;
- give proposals a mobile summary-to-detail hierarchy;
- keep backend schema, RPCs, realtime, authorization, and domain lifecycle semantics unchanged;
- verify complete task flows at 320–430 px in both languages.
