# HeavyUser agent guide

HeavyUser is a focused authenticated task workspace with synced tasks, Google Calendar-backed Spaces, automatic scheduling, durable timers, and account settings. Keep the surface compact, but treat the Calendar, scheduler, timer, task-sync, and authentication paths as one reliability system.

## Repository identity

- The authoritative runnable checkout is `/Users/kowshik/Projects/HeavyUser`.
- `/Users/kowshik/.codex/.chatgpt-projects/g-p-6a53428369508191b1e12179b516b0c3` is a reference-only ChatGPT project mirror.
- At the beginning of every run, verify `pwd`, `realpath`, `git status`, the current branch, and `git rev-parse HEAD`.
- Read `.heavyuser/change-manifest.json` before editing. Preserve existing user changes and classify them before adding new work.
- For a new change group, update the manifest's `baselineSha`, `changeType`, `mode`, `changeId`, `riskAreas`, `planFile` when required, allowed paths, evidence level, and expected migrations before editing.
- For Calendar, Scheduler, Timer, Auth, Supabase, persistence, retry, lifecycle, or security work, copy `docs/engineering/change-contract-template.md` to `docs/qa/changes/` and complete it before coding.
- The contract must be new or changed in the current work, its ID must match the manifest, and every risk area detected from changed files must be listed.

## Current product scope

- Tasks: capture, edit, complete, delete, reorder, estimate, dates, priorities, and account-scoped recovery cache.
- Account: passwordless Supabase Auth, profile, private avatar, settings, and Night Owl planning preferences.
- Calendar: Google connection/reconnect/disconnect, calendar-backed Spaces/Sub-spaces, ordinary event display/editing where supported, managed task blocks, sync, cleanup, and provider error recovery.
- Scheduler: timezone-aware work windows, automatic planning, conflict handling, queue retries, Space ownership, and repair/cleanup work.
- Timer: durable sessions, paused/stopped work history, active-block state, corrections, missed blocks, idempotent retries, and cumulative task totals.

Deferred work includes collaboration, dashboards, extra authentication providers, password authentication, MFA, public APIs, and unrelated integrations. Do not remove or reject currently implemented Calendar, Space, scheduler, or timer behavior because an older document calls it a non-goal.

## Default working rules

1. Investigate the underlying invariant before patching the visible symptom.
2. Keep one bounded change group at a time. Split work that crosses unrelated product areas.
3. Add or update the regression test with every bug fix.
4. For stateful changes, record the source of truth, ownership, allowed states, retry identity, concurrency rule, failure behavior, and user recovery action in `ARCHITECTURE.md`.
5. Do not silently broaden scope, rewrite unrelated files, or discard existing changes.
6. A read-only audit is genuinely read-only: report findings and write only the approved audit artifact. Remediation needs an implementation request or explicit authorization.
7. If implementation reveals a new invariant or edge case, update the filled change contract and add the regression before continuing.

## Evidence rules

Label every result as one of: `code`, `mocked`, `local`, `linked-database`, `provider-qa`, or `production`.

- A public redirect proves routing, not an authenticated session.
- Mocked E2E proves application behavior under the mock, not Google consent, SMTP delivery, or a live account.
- Migration parity and schema lint do not prove database behavior tests.
- Every contract row must be `PASS`, `BLOCKED`, `NOT RUN`, or `N/A` with a reason where needed.
- Never call blocked provider, browser, email, or authenticated proof a pass.

## Start and finish gates

At the start of a change, run `pnpm preflight`, `pnpm check:contract`, and inspect the declared change manifest. The checks compare the real pull-request or push changes against the correct starting version. During implementation, use `pnpm check:scope` to catch unrelated files.

Before handoff, run `pnpm verify`. It runs the checks sequentially so generated Next artifacts cannot race typecheck or build. E2E must not leave tracked configuration changes. Do not claim a clean tree until `git status` confirms it.

For authentication, Supabase, Calendar, scheduler, timer, or security releases, use isolated QA data and require the provider-QA and exact deployed-SHA evidence described in `ARCHITECTURE.md`. Do not deploy from an unexplained dirty tree.

## Important files

- `src/app/page.tsx` — task workspace, task interactions, and recovery cache.
- `src/components/auth-provider.tsx` — browser session, profile, and account settings.
- `src/components/google-calendar-panel.tsx` — planner and Calendar event presentation.
- `src/lib/google/` — provider client, sync, errors, and event ownership.
- `src/lib/scheduler/` — planning, preferences, queue, reconciliation, and repairs.
- `src/lib/timer/` — durable timer sessions, totals, corrections, and idempotency.
- `src/lib/task-rules.ts` and `src/lib/supabase/tasks.ts` — task validation and persistence.
- `supabase/migrations/` and `supabase/tests/database/` — append-only schema and database safety checks.
- `design.md` — visual and interaction authority.
- `ARCHITECTURE.md` — state ownership and reliability authority.
- `docs/engineering/change-contract-template.md` — before-coding contract template.
- `docs/qa/edge-case-and-evidence-template.md` — edge-case and evidence checklist.

## Routine commands

```sh
pnpm preflight
pnpm verify
```

Use `pnpm supabase:types:check` to compare generated database types without rewriting the tracked file. Never print secrets or commit service-role credentials.
