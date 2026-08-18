# UX research: Time Loom / 时间织机

## Product thesis

MuPlaytime is a small co-op lobby organized around time, not an enterprise calendar. Each member's availability is a thread, hour lines are the warp, and the strength of a rendezvous knot represents how many room members are explicitly free. It is an observation and suggestion surface, not an availability gate.

## Visual tokens

- Cloud Canvas `#F1F3F9`: page and unknown timeline background.
- Night Thread `#20263D`: text, rules, and primary controls.
- Free Jade `#087C6B`: explicit free intervals.
- Busy Coral `#B33E57`: busy/working intervals.
- Shuttle Violet `#5F4FB2`: selection, links, and active navigation.
- Common Gold `#E2A629`: high-overlap rendezvous knots, always paired with dark text. Intensity and an explicit numeric count represent overlap; gold must not imply guaranteed attendance.

State must not rely on color alone: free uses a solid/open-circle motif, busy uses diagonal hatching, and unknown remains unfilled with a dotted rail.

## Type

- Display and day headings: `ZCOOL QingKe HuangYou`, then `Noto Sans SC`, used sparingly for the wordmark, weekday labels, and proposal status.
- Body and controls: `Noto Sans SC`, then system UI fallbacks at 400/600/700.
- Time and data: `IBM Plex Mono`, then CJK/system monospace fallbacks with tabular numerals.

Font licenses and current distribution sources must be live-verified before self-hosting. Chinese text must not receive Latin letter spacing, and translated controls should reserve 20–30% width expansion.

## Layout

Desktop uses one continuous board rather than a dashboard of rounded cards. Member labels and day/time headers remain sticky. A proposal rail sits beside the timetable, and proposal rows use restrained ticket-like notches.

```text
┌ MU/PLAYTIME · Friday Crew [English/简体中文] [Asia/Dubai] [Invite] ┐
├ ‹ Aug 17–23 ›  [Group] [My schedule]   [Plan a game / 发起游戏提议] ┤
│ MON 17                 TUE 18                   │ PROPOSALS       │
│ Percy  ···████────                               │ Deep Rock       │
│ Lina   ///██████──  ← rendezvous shuttle         │ 3 accepted      │
│ Omar   ···████────     3 of 5 marked free        │ + Suggest time  │
│        [Propose this time / 提议此时段]           │ Threshold alert │
└──────────────────────────────────────────────────┴─────────────────┘
```

Mobile defaults to one day with a horizontally scrollable time rail, sticky member labels, and bottom navigation for Schedule, Proposals, and Me. Editing and proposal details use full-height sheets instead of compressed desktop modals.

## Signature interaction: Rendezvous Shuttle / 会合梭

A two-handled, draggable selection shuttle crosses every visible member row on one viewer-timezone axis. It exposes each member's schedule-local weekday/time only as supplementary callouts for the same UTC instant. As the selected duration crosses member intervals, the knot updates continuously; each segment retains its own numeric count, while the compact summary reports the minimum and observed range without averaging. Higher overlap produces a stronger gold knot, while every time remains proposal-eligible and reveals `Propose this time / 提议此时段`.

The shuttle needs two independently focusable 44 px handles with range-slider semantics and arrow-key movement in 30-minute steps, plus ordinary start/end date/time inputs as an equivalent accessible path. On touch screens, a gesture begun on a handle moves only that boundary; gestures begun elsewhere retain horizontal timeline panning. A mobile detail sheet exposes the selected window segment by segment with free/busy/unknown membership. Switching the viewer timezone keeps the same UTC selection. Reduced-motion mode updates instantly without weaving/gliding animation.

## Accessibility and critique

- Maintain WCAG AA contrast, visible `:focus-visible`, logical grid traversal, and descriptive interval announcements.
- Keep the full IANA zone visible in edit/details and the viewer zone beside each range.
- Language switching preserves route, scroll, and current selection.
- Avoid glassmorphism, neon-on-black gaming tropes, gradient metric cards, generic avatars, excessive pills, and decorative thread graphics. The weaving metaphor is limited to truthful interval textures and the single shuttle interaction.
