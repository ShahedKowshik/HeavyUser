# Habit data consistency audit
Date: 2026-10-16

## Root causes
1. A check-off toggled from completed to false but left explicit_status='completed'. The list, calendar and analytics disagreed.
2. Check-off undo used a confirmed false/zero row rather than removing the row, confusing unknown with a confirmed failure.
3. Different UI sections recomputed success independently; chart, coverage, streaks, and history could diverge.
4. Undo for the first quantity event changed an absent record into a confirmed zero, inflating zero-day statistics.
5. Timestamp+random UUID ordering did not guarantee which undo event was last when several database changes happened in one transaction.
6. Parallel reloads could apply an older response after a newer update.
7. An optimistic counter update copied an old 'skipped' status until the server refresh.

## Invariants
- Check-offs: true=done; false/absent with no explicit 'missed' or 'skipped' = unrecorded.
- Undo a check-off deletes its daily entry, but the revision history preserves the original action.
- Only explicitly Missed is failure; Skipped is an intentional break; unrecorded is unknown.
- Duration and sleep with no actual recorded measurement are unknown.
- First quantity event undone returns to no row; previously confirmed zero restored as zero.
- Quantity undo is idempotent by operation ID and guarded against intervening edits.
- Events and revisions use monotonic database sequences for ordering, not timestamps or UUIDs.
- All screens use the same stateFor(h, date...) method and computed coverage; no phantom completion.
- No incoming stale refresh replaces newer data.
- Audited change history is available only to the authenticated owner.

## Migrations
- quantity_undo_restores_previous_record_and_conflict_guard
- stable_undo_event_and_revision_sequence_order
- consistency constraints and the targeted Brush correction (after UI release)

## QA
Tests cover valid/invalid check states, failed/skipped/unknown, week progress, streaks,
numeric zero, missing duration/sleep, calendar/list consistency, repeated undo,
concurrent ordering, authentication isolation, cascading deletes, and outdated responses.
SQL integration tests ran in a transaction and were rolled back without changing real records.

## Limitation
Legacy quantity events created before snapshot support cannot reconstruct prior row metadata; 
they restore their numeric total only. New events capture both prior and resulting row state.
