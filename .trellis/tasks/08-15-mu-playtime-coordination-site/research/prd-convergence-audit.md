# PRD convergence audit

## Status on 2026-08-17

The previously blocking product decisions are resolved in `prd.md` and reflected in `design.md`:

1. The timetable is advisory. It reports the explicit-free count and free/busy/unknown breakdown across every room member; it does not require or promise an all-members-free result.
2. A personal schedule timezone change previews two explicit choices: keep the existing schedule anchor and change only the viewer zone, or migrate the schedule anchor while preserving local weekday/date/clock values.
3. Interval edits use paint-and-replace. The first concrete-date edit snapshots the resolved weekly day into a full-day override; restoring deletes that override.
4. Proposal correction never changes a voted instant in place. The defined rename, withdrawal, confirmation, cancellation, and rescheduling transitions preserve prior response meaning.

The PRD also now defines custom-threshold edge behavior, same-browser restoration, schedule Realtime freshness, DST and cross-date cases, accessibility and failure states, measurable viewports and freshness bounds, exact deployment smoke flows, and the absence of stray room-name or proposal-note scope. The complex-task artifacts and curated JSONL manifests are present. No product question from this audit remains open.

## Final review additions resolved on 2026-08-18

- `normalize_name_v1` now fixes NFC, outer Unicode whitespace, root-locale lowercase, internal-whitespace, compatibility-folding, first-display-spelling, and acceptance-vector behavior.
- Proposal creation and its required initial option are one transaction.
- Terminal option/proposal transitions expire only untriggered watches with explicit reasons; triggered reminders remain acknowledgeable and the scheduled final option stays active.
- Every room-change event invalidates all canonical queries for that small room, so cross-domain effects do not rely on an incomplete topic map.
- The personal-site application link is required; a repository link is conditional on separate public-repository authorization.
- RPC authorization, proposal/watch concurrency, total DST resolution, delete-independent Realtime freshness, and shared-origin session risk are fully specified in `design.md` and `implement.md`.

## Non-blockers

- Equal room membership and proposal-creator-only finalization are compatible because the latter is scoped to one proposal.
- Framework, routing, RLS/RPC structure, interval resolution, grid granularity, and test tools are implementation/design decisions rather than product questions.
