# Realtime warmup break-loop

## Symptom

After a fresh local Supabase reset, a two-client browser run completed room
creation and join, but the creator did not receive the first
`room_change_events` insert within ten seconds. The committed event and joined
member both existed in Postgres. The same flow had passed before the reset and
passed again after Realtime was warm.

## Root cause category

This was a freshness-boundary startup race, not a missing domain transaction or
an RLS leak. Supabase Realtime reported the channel as `SUBSCRIBED` while its
tenant replication worker was still initializing after the database restart.
The first insert could therefore fall after the subscription callback but before
the Postgres Changes stream was fully ready.

## Why the previous safeguards were insufficient

- Refetching immediately on `SUBSCRIBED` closed the gap before the callback, but
  not the short replication-startup gap after it.
- Waiting for that immediate snapshot in the browser test proved the query path,
  not delivery readiness of the underlying replication worker.
- Blindly increasing the browser timeout would not reconcile an event that had
  already been missed.
- Permanent short-interval polling would hide the race at unnecessary ongoing
  database and network cost.

## Prevention

- Keep Realtime as a freshness hint and Postgres snapshots as canonical state.
- On each successful subscription, invalidate immediately and once more after a
  bounded two-second warmup. Clear the timer when the room unmounts.
- Preserve reconnect, online, and visible-tab invalidation paths for later gaps;
  do not introduce a second client-side event reducer.
- Unit-test the immediate and delayed invalidations plus timer cleanup.
- Keep the configured two-client E2E as the cross-layer regression: creator sees
  joiner, proposals and responses reconcile, and durable reminders survive
  reload.

## Evidence

- `src/realtime/roomRealtime.test.ts`: two warmup/timer lifecycle tests.
- `npm run test:e2e:live`: two configured browser tests passed after the fix.
- `.trellis/spec/frontend/data-time-contracts.md`: warmup reconciliation is now
  an executable frontend data contract.
