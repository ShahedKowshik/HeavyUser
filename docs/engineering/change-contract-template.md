# HeavyUser change contract template

Copy this file to `docs/qa/changes/YYYY-MM-DD-short-name.md` before coding a
Calendar, Scheduler, Timer, Auth, Supabase, persistence, retry, or lifecycle
or security change. Give the work a new `Change ID`, copy this file to
`docs/qa/changes/`, and replace the prompts before handoff. The ID in the
manifest and the Markdown file must match.

The goal is simple: decide what must stay true before changing the code.

Change ID: YYYY-MM-DD-short-name

## Goal

- What user problem or reliability rule is changing?
- What does success look like?

## Out of scope

- What will not change in this work?

## Affected systems and risks

- Risk areas from the change manifest:
- Every risk area found by the changed-file checker:
- Allowed paths:
- Expected migrations:
- Does this change cross UI, provider, database, worker, or browser boundaries?

## Source of truth and ownership

| Area | Source of truth | Derived or cached data | Owner and rule |
| --- | --- | --- | --- |
|  |  |  |  |

## State and failure contract

- Allowed states:
- State transitions:
- What must survive reload, deletion, disconnect, reconnect, or partial failure?
- What must never be shown as successful?

## Concurrency, retries, and time

- What happens with duplicate requests, two tabs, two devices, a lost response,
  a worker retry, or a provider timeout?
- What is the stable retry or operation identity?
- Which timezone owns each date or event?
- Which ISO/UTC instants and DST boundaries will tests use?

## User-visible recovery

- What message or action does the user see after each important failure?
- Can the user retry, reconnect, undo, or continue safely?

## Edge-case and evidence matrix

Every row must end as `PASS`, `BLOCKED`, `NOT RUN`, or `N/A`. A blocked, not-run,
or not-applicable row needs a reason. Evidence must use one of `code`, `mocked`,
`local`, `linked-database`, `provider-qa`, or `production`.

| Area | Scenario | Expected result | Test/evidence | Layer | Status | Reason or link |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## Rollback and cleanup

- How can this change be safely reverted?
- What temporary data, provider events, migrations, generated files, or test
  accounts must be cleaned up?
