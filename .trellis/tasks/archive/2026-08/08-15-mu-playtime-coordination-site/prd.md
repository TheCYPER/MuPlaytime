# MuPlaytime Coordination Site

## Goal

Give a small trusted group spread across UTC+8, UAE/UTC+4, several United States time zones, the United Kingdom, and other regions a low-friction way to observe overlapping free time and coordinate game sessions. Members enter only a display name, maintain a recurring personal schedule, view every instant in their own timezone, and use overlap estimates to suggest, vote on, and confirm play times. The timetable is advisory rather than an availability gate: people may move their plans after seeing a proposal.

## Background and constraints

- The audience is a private friend group. The MVP does not need passwords, OAuth, account recovery, or public user discovery.
- The application will be developed in `/Users/percy/MuPlaytime` and published at `https://thecyper.github.io/MuPlaytime/`. The directory currently has Trellis/Codex scaffolding but no product source and is not a Git repository.
- That URL shares the `https://thecyper.github.io` origin with the personal site and other project pages. Browser storage therefore cannot be isolated by `/MuPlaytime/`; the MVP explicitly treats every script served from that origin as trusted. A compromise elsewhere on the origin could expose the persisted anonymous room session. A dedicated origin is the future isolation path if that risk becomes unacceptable.
- GitHub Pages can host only the static frontend. Cross-device persistence, realtime updates, room isolation, and durable threshold reminders require a hosted data service; the planned design uses Supabase Postgres, Realtime, and invisible anonymous sessions.
- A browser-writable GitHub repository is rejected because it would require exposing a GitHub credential. Browser-only local storage is non-authoritative because it cannot synchronize the group.
- `TheCYPER/MuPlaytime` does not yet exist. The separate `TheCYPER/TheCYPER.github.io` Astro site can publish a project card through `src/content/projects/mu-playtime.yaml` only after the application is live and smoke-tested.

## Requirements

### R1. Link-based rooms and weak name identity

- A visitor can create an isolated room or join one through an unguessable invite link. There is no public room list, search, or recommendation surface.
- The raw permanent invite capability appears in the URL fragment, is removed after a successful claim, and is retained only in memory for the current tab so it can be copied immediately. It is never written to `localStorage`, `sessionStorage`, IndexedDB, or the database; after refresh or tab close, a member must use a previously saved/shared invite link to invite another person.
- Members, schedules, proposals, options, responses, watches, and reminders are room-scoped and must never appear in or affect another room.
- Room creators and later joiners have equal room-level permissions. The MVP has no owner, administrator, host, member-removal, invite-rotation, room-deletion, or room-migration controls. If an invite leaks, members must abandon that room and create another.
- Joining requires only a display name. The UI does not expose a registration or login flow; an invisible anonymous session may exist solely to enforce database room boundaries.
- The browser detects an initial IANA timezone and lets the member change it through the explicit timezone behavior in R8.
- The browser remembers the last claimed member, room, viewer timezone, language, and view so a refresh or later visit can resume locally.
- A normalized name is unique within a room. The server-owned `normalize_name_v1` algorithm first applies Unicode NFC, removes only leading/trailing Unicode `White_Space`, then applies locale-independent Unicode lowercase using a pinned Unicode/ICU root-locale data version. It does not collapse internal whitespace and does not apply NFKC/compatibility folding. The trimmed NFC spelling from the first claim is the stored display name; later equivalent claims never rename it. An empty result is rejected.
- Entering an existing normalized name intentionally claims that member profile and schedule, including from another device. Anyone holding the room link can impersonate a name; this accepted trusted-group risk must not be presented as secure identity.
- Claiming an existing name maps the new anonymous session to that member but never changes the member's stored schedule timezone. The detected/requested zone remains that browser's viewer preference unless a new member and schedule are created.

### R2. Recurring personal schedules and date overrides

- A member can create, adjust, and delete `free` and `busy/working` intervals. Unmarked time is `unknown` and is never inferred to be free.
- The base schedule is a weekly wall-clock template anchored to an IANA timezone and expresses regular classes, work, and free time.
- A specific date can diverge from the weekly template through a full-day date override.
- Editing uses paint-and-replace semantics: a new interval replaces the overlapping portion, automatically preserves or splits unaffected portions, and leaves at most one explicit state for a member at any instant.
- On the first edit to a concrete date, the application copies that date's resolved weekly intervals into a full-day override. Subsequent edits read only the override for that date rather than merging it again with the weekly template.
- `Restore weekly template` deletes the full-day override. Blank spans return to `unknown`; zero-duration and reversed intervals are rejected.
- The final MVP must include both the recurring weekly template and concrete-date override behavior.

### R3. Advisory overlap timetable

- The group timetable renders every member's schedule in the current viewer's timezone without requiring manual conversion.
- Every visible time segment shows how many room members are explicitly `free`, the room-member total, and an inspectable breakdown of who is free, busy, or unknown.
- The timetable's spatial axis always uses the current viewer timezone. A member's schedule timezone and local time may appear as supplementary labels or details but must never create a different axis within that member's row.
- `busy/working` and `unknown` do not increase the free count, but they never hide the time segment or turn it into a hard available/unavailable result.
- Higher-overlap segments receive stronger visual emphasis and may be ranked as suggested windows. All-members-free is merely the maximum overlap case.
- A selected window that crosses segments with different counts preserves their segment-by-segment values. Its compact summary shows the minimum explicit-free count and the observed range rather than an average or a single ambiguous count.
- Any time segment can seed a proposal regardless of its current free count. Copy and visuals must describe the result as an estimate, not a guarantee of attendance.
- Changing the viewer timezone re-renders the same instants and must not mutate stored schedules or proposals.

### R4. Multi-option game proposals and lifecycle

- A member can seed a proposal from the personal or group timetable. A proposal contains a game name, creator, status, and at least one initial time option.
- Proposal creation and its initial option are one atomic operation. The system never exposes or persists an empty proposal or a partially created initial option.
- Each option has a concrete start instant, duration, source timezone, and suggester. Before confirmation, any room member can add another parallel option.
- The proposal creator can confirm one option as the final time. This proposal-scoped capability is not a room administration role.
- Confirmation changes the proposal to `scheduled`, closes non-final options to new responses, and leaves attendance on the final option editable by each member.
- Before confirmation, the proposal creator can rename the game or cancel the proposal. Cancellation preserves a read-only record and closes options and responses.
- Before confirmation, an option suggester can withdraw their own option. An option's time is never edited in place; correcting it requires withdrawing it and adding a new option so existing votes cannot silently change meaning.
- After confirmation, the final time is immutable. The proposal creator may cancel the scheduled proposal, but rescheduling requires a new proposal.
- Committed proposal and option changes appear in other online clients without a manual refresh.

### R5. Per-option responses and suggested times

- Each member has at most one current response per option: `accept`, `decline`, or `maybe`.
- A member can set, change, or withdraw their own response independently for any response-eligible option: each active option while the proposal is open, and only the confirmed option while it is scheduled.
- A withdrawn response is absent from the user's current choice and every aggregate. The backend may preserve it as an inactive tombstone so synchronization does not depend on filtered delete events.
- Adding a parallel option is the suggested-time workflow. Original and suggested options remain visibly grouped under one proposal and show their suggester.
- Duplicate counting is prohibited even when the same normalized name is claimed from several devices.

### R6. Custom crowd-following reminders

- A member can set `Remind me when X people accept` on a specific option, where `X` is any positive integer rather than a fixed 2/3 choice.
- The UI may offer common presets, accepts a custom value, and warns rather than rejects when `X` exceeds the current room-member count because future members may make it reachable.
- Only distinct current `accept` responses on that option count. Other options and reminder watches do not contribute.
- Creating or editing an untriggered watch evaluates the current count immediately. An already-satisfied watch triggers immediately.
- Triggering creates one durable in-app reminder and never changes the member's response. A later count drop does not retract or retrigger it.
- A member can acknowledge the reminder. Acknowledgement closes that watch; setting another threshold later is an explicit new watch and is evaluated afresh.
- New or edited watches are allowed only while their option is response-eligible. If an option is withdrawn, a non-final option closes on confirmation, or a proposal is cancelled, each untriggered watch on the closed option expires with a visible reason. A watch that already triggered remains visible and can always be acknowledged even after its option/proposal closes; it never triggers again. An untriggered watch on the confirmed scheduled option remains active while final attendance is editable.
- The reminder is visible immediately while online and remains available on the next visit after being offline. Email, SMS, and Web Push are not part of the MVP.

### R7. Shared persistence, realtime freshness, and room boundaries

- Schedules, proposals, options, responses, watches, and reminder state persist across refreshes and browser restarts.
- Under a healthy connection, committed changes appear automatically in other open clients; reconnecting or returning to a tab refetches canonical state so Realtime is not treated as durable storage.
- Database constraints enforce room-aware references, one normalized member name per room, one response per member/option, and atomic proposal confirmation and threshold triggering.
- Every browser-callable database mutation derives the acting anonymous user from the request, resolves the current room-member claim server-side, and checks room membership plus member/creator/suggester authority internally. No public mutation accepts an actor id as authority. Database policies reject reads without a claimed session and direct table writes; the deliberate invite-plus-same-name claim path remains allowed and is not strong authentication.
- Status-dependent proposal mutations are serialized and recheck proposal status and option activity after acquiring a common lock order. Response and reminder-watch mutations for one option are serialized before recounting accepts, so concurrent operations cannot commit a late transition or miss a threshold trigger.
- Every successful room mutation writes a room-scoped insert-only change signal in the same transaction. Online clients use that signal only to refetch canonical state, so schedule/response withdrawal and other physical deletions do not depend on database `DELETE` payload behavior.
- The static bundle may contain only browser-safe public Supabase configuration. It must never contain a service-role key, database password, GitHub token, invite digest, or other privileged credential.

### R8. Timezone and daylight-saving correctness

- Concrete proposal option starts are stored as UTC instants and retain their source IANA timezone for explanation and the add-a-corrected-option flow. Numeric UTC offsets alone are not accepted as timezone identity, and an existing option is never edited in place.
- Recurring schedules are stored as local weekday/time rules anchored to an IANA timezone and are resolved only for concrete dates.
- Exactly one schedule set owns a member's authoritative schedule IANA timezone; the member profile does not duplicate it. A new-member claim initializes that anchor, while an existing-name claim leaves it untouched.
- Recurring and date-override intervals use local-minute set semantics. A nonexistent spring-forward minute contributes no instant; a repeated fall-back minute contributes both real instants. The resolver may therefore yield zero, one, or several UTC intervals, coalesces adjacent results, never emits a zero/negative interval, and visibly annotates skipped or repeated portions. Minute `1440` is the exclusive next-day boundary after cross-midnight intervals have been split.
- Cross-day, cross-month, cross-year, spring-forward, and fall-back behavior is otherwise deterministic and uses the same contract for weekly rules, full-day overrides, previews, and migrations.
- Changing only the viewer timezone never writes schedule data.
- When a member requests a personal schedule timezone change, the application previews affected weekly and date-override intervals and asks the member to choose one of two operations: keep the existing IANA anchor and only view it in the new zone, or migrate the schedule to the new IANA zone while preserving local weekdays, dates, and clock times.
- No schedule-zone operation is written before explicit confirmation. Existing proposal options remain the same UTC instants under either choice.
- When a proposal start is entered as local date/time, an ambiguous time requires the user to choose one offset-labeled occurrence. A nonexistent time is not shifted silently: the UI explains the gap and requires explicit selection of a valid suggested time before storing the UTC instant.

### R9. Bilingual, responsive, and accessible interaction

- Desktop supports efficient week comparison. Mobile supports the complete join, schedule-edit, overlap-view, proposal, option-response, and reminder flows without shrinking the desktop grid beyond usability.
- On mobile, selecting a window exposes its segment-by-segment free/busy/unknown breakdown in an accessible detail sheet. Dragging begins only from a selection handle while gestures elsewhere retain ordinary timeline panning; both start and end handles are independently keyboard-focusable and have equivalent date/time fields.
- Keyboard focus is visible, core actions are keyboard-operable, touch targets are usable, and reduced-motion preferences are respected.
- Empty schedules, low-overlap periods, saving, offline/reconnecting, synchronization failure, cancelled proposals, and no active proposals provide an explicit explanation and next action.
- The MVP ships English and Simplified Chinese UI copy. The first visit follows the browser language and falls back to English; a manual language switch is persisted locally and preserves route, scroll, and current selection.
- Dates, weekdays, timezone explanations, statuses, validation errors, and empty states are localized. Member and game names are never translated; member names use the first stored trimmed-NFC spelling defined in R1.
- Status is never communicated by color alone.

### R10. GitHub Pages deployment and personal-site integration

- The frontend is a static project-site build whose assets and routes work under the exact `/MuPlaytime/` base path.
- GitHub Actions produces and deploys a reproducible Pages artifact from a lockfile-controlled build.
- A fresh invite link, a claimed room URL, refresh, static assets, anonymous-session restoration, and Supabase connectivity all work at `https://thecyper.github.io/MuPlaytime/`.
- Only after the public application passes the core smoke flow does the personal site publish a MuPlaytime project card linking to the application. A repository link is added only if repository visibility and publication are separately authorized and the URL is public.

## Acceptance criteria

- [ ] **AC1:** A visitor can create or join a room, enter only a display name, accept the detected IANA timezone, and reach the timetable; the same browser restores the last claimed room/member/view after refresh and a later revisit.
- [ ] **AC1a:** Two rooms can contain identical display names and simultaneous activity without any member, schedule, proposal, option, response, reminder, aggregate, or Realtime update crossing rooms.
- [ ] **AC1b:** A visitor without an invite cannot browse or search existing rooms through the application.
- [ ] **AC1c:** A room creator and later joiner have the same room-level features; no owner/admin panel, member removal, invite rotation, or room deletion is present.
- [ ] **AC1d:** Server normalization makes `" Percy "`, `"percy"`, and a Unicode-outer-whitespace variant the same claim; makes precomposed `"É"` and decomposed `"E\u0301"` the same claim; keeps `"A  B"` distinct from `"A B"`; and keeps full-width compatibility text distinct from ASCII. Client previews match the returned server key, and a later claim never changes the first stored display spelling.
- [ ] **AC2:** A member can create, adjust, and delete `free` and `busy/working` intervals, and the result persists after refresh.
- [ ] **AC2a:** A weekly rule recurs on the same local weekday and clock time in later weeks; editing one date changes only its full-day override, and `Restore weekly template` returns that date to the template result.
- [ ] **AC2b:** Painting over an interval splits or preserves unaffected portions and produces no instant that is simultaneously `free` and `busy/working`; invalid or zero-length intervals are rejected.
- [ ] **AC3:** Clients viewing one stored instant in different IANA zones show different correct local dates/times while retaining the same UTC instant.
- [ ] **AC3a:** A schedule-zone change shows a before/after preview, supports both keep-anchor and migrate-local-clock choices, writes nothing before confirmation, and never alters an existing proposal option instant.
- [ ] **AC3b:** Automated cases cover Dubai/no-DST, representative US and UK spring-forward/fall-back transitions, midnight crossings, and year boundaries with deterministic results and an affected-time annotation.
- [ ] **AC3c:** Tests prove that skipped local minutes produce no zero/reversed UTC interval, repeated local minutes produce both real occurrences, `1440` resolves as an exclusive next-day boundary, and weekly rules, date overrides, and migration previews use the same resolver. Ambiguous proposal input requires an offset choice and nonexistent input requires an explicit valid replacement.
- [ ] **AC4:** Every visible segment reports the exact explicit-free count and member breakdown. Adding a member whose entire week is `unknown` increases the unknown/total figures without hiding or changing other members' free counts.
- [ ] **AC4a:** Higher counts receive stronger advisory emphasis, but a proposal can be started from a zero-, partial-, or all-member-free segment and the UI never promises attendance.
- [ ] **AC4b:** The grid axis remains in the viewer timezone. If a selection spans segments with different counts, the detail view preserves every segment and the compact summary reports the minimum and range without averaging; member-local times appear only as supplementary callouts.
- [ ] **AC5:** Under a healthy connection, a proposal or option committed in one client becomes visible in a second open client within three seconds without refresh.
- [ ] **AC5a:** Under the same conditions, committed schedule and response changes update the second client within three seconds; reconnect or tab resume reconciles missed state by refetching.
- [ ] **AC5b:** Response withdrawal, date-override restoration, and any other mutation that removes canonical rows still produce a room-scoped insert change signal and update a second client within three seconds without relying on a filtered `DELETE` event.
- [ ] **AC6:** A member can accept, decline, mark maybe, change, or withdraw a response independently per option; one normalized member is never counted twice even when claimed from two devices.
- [ ] **AC7:** Any member can add a parallel option to an open proposal; all clients show its suggester and independent response totals under the original proposal.
- [ ] **AC7a:** The proposal creator can confirm one option atomically; the proposal becomes scheduled, non-final options close, and members can still update attendance on the final option.
- [ ] **AC7b:** Before confirmation, rename/cancel/own-option-withdraw work without editing a voted option's time in place. After confirmation, the time cannot change; cancellation is read-only and rescheduling requires a new proposal.
- [ ] **AC7c:** A forced failure between proposal and initial-option creation leaves neither row visible or persisted; every successfully visible proposal has at least one initial option from the same transaction.
- [ ] **AC8:** Custom positive `X` supports presets and manual input. Already-met watches trigger immediately; a triggered watch persists through a count drop and offline revisit, fires once, does not auto-accept, and can be acknowledged before an explicit new watch is created.
- [ ] **AC8a:** Withdrawing an option, confirming another option, or cancelling a proposal atomically expires affected untriggered watches with the correct reason. Triggered reminders remain acknowledgeable after every terminal transition, while an untriggered watch on the scheduled final option remains active.
- [ ] **AC9:** At 1280×720 and 375×812 viewports, a user can complete join, schedule editing, overlap inspection, proposal creation, option response, threshold watch, and acknowledgement without clipped required controls.
- [ ] **AC9a:** A Chinese-preferred browser starts in Simplified Chinese and other unsupported preferences fall back to English; manual switching survives refresh, preserves context, and neither language causes blocking overflow.
- [ ] **AC9b:** The core flow is keyboard-operable with visible focus; state has non-color cues; reduced-motion removes nonessential animation; each required empty, saving, reconnecting, and failure state provides a next action.
- [ ] **AC9c:** At the mobile target viewport, dragging either 44px selection handle does not pan the timeline, dragging elsewhere pans normally, each handle can be focused and adjusted independently by keyboard, and the selected-window breakdown is usable through the detail sheet and equivalent date/time fields.
- [ ] **AC10:** Production-like database tests invoke every public RPC plus direct table reads/writes as an unauthenticated client, a claimed client targeting another room, and a claimed client supplying another member/creator/suggester id. Every unauthorized path is rejected independently of UI controls, while the documented invite-plus-same-name claim succeeds. The built frontend contains no privileged secret.
- [ ] **AC10a:** The app never persists a raw invite capability, applies a restrictive app CSP, documents that persisted anonymous sessions are readable by any compromised script on the shared `thecyper.github.io` origin, and records explicit acceptance of that MVP trust boundary before production publication.
- [ ] **AC11:** The production artifact loads at `/MuPlaytime/`, all asset requests remain under that base, fresh fragment invite and claimed-room URLs load and refresh without 404, and the full create-room → second-client join → schedule → proposal → response smoke flow succeeds on the public URL.
- [ ] **AC12:** Only after AC11 passes, `https://thecyper.github.io/projects/` displays a non-draft MuPlaytime card whose application link succeeds. A repository link is absent unless separately authorized and publicly reachable; when present, it also succeeds.

## Out of scope for the MVP

- Passwords, OAuth, account recovery, strong identity, one-human/one-profile guarantees, or a public user/room directory.
- Room owners, administrators, member removal, invite rotation, room deletion, room-to-room migration, bulk import/export, or a self-service retention tool.
- Chat, voice, game-server management, or automatic game launching.
- Google Calendar, Outlook, or Apple Calendar synchronization.
- Reliable offline email, SMS, or Web Push notifications.
- A dedicated custom origin that isolates MuPlaytime browser storage from other `thecyper.github.io` pages.
- In-place edits to voted option times or confirmed event times.
- Publishing the personal-site card before the application is live and passes its smoke flow.
