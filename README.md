# HeavyUser

> Make the next important task obvious—and protect the time to do it.

HeavyUser is a focused execution workspace for people carrying more active work than a simple to-do list can hold. It puts a prioritized task queue beside a Calendar-backed planner so the next action and the time to do it stay in the same view.

**[Open the live app](https://web.heavyuser.app)** · **[View the source](https://github.com/ShahedKowshik/HeavyUser)** · **[Share feedback](https://github.com/ShahedKowshik/HeavyUser/issues/new)**

## What works today

- Passwordless Supabase account entry, profile editing, private avatar storage, and account-synced settings.
- Account-scoped task capture, editing, completion, deletion, reordering, priorities, dates, estimates, and recovery cache.
- Google Calendar connection, reconnect, disconnect, sync, managed task blocks, Calendar-backed Spaces/Sub-spaces, and supported ordinary-event actions.
- Automatic scheduling across work windows, Night Owl logical days, timezones, busy events, Spaces, retries, cleanup, and repairs.
- Durable timers with persisted sessions, paused/stopped work history, active-block state, corrections, missed blocks, idempotent retries, and cumulative totals.
- Compact responsive task-first UI with keyboard and focus support.

The source and deterministic test suite cover these behaviors. Provider-backed proof is still required for releases that change authentication, Supabase data, Google Calendar, scheduling, or timers.

## Product principles

- **Task-first:** the next piece of work gets the strongest visual priority.
- **Time belongs next to work:** planning is part of execution, not a separate report.
- **Quiet until useful:** neutral surfaces carry the interface; green marks focus, current time, today, and completion.
- **Small surface area:** keep the main workspace focused and defer dashboards, collaboration, extra auth providers, MFA, public APIs, and unrelated integrations.
- **Safe iteration:** one bounded change group, one explicit invariant, a regression test, and evidence that matches the claim.

## Deployment and proof

Production is hosted on Vercel at [web.heavyuser.app](https://web.heavyuser.app). A successful public response proves routing only. A production release is complete only when the exact deployed commit, migration parity, required local/CI checks, and the relevant authenticated QA journey have been verified.

## Run locally

Requirements: Node.js 24+ and pnpm.

```bash
git clone https://github.com/ShahedKowshik/HeavyUser.git
cd HeavyUser
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify safely

```bash
pnpm preflight
pnpm verify
```

`pnpm verify` runs lint, typecheck, unit tests, production build, isolated E2E, dependency audits, generated-file checks, and linked Supabase checks sequentially. `pnpm supabase:types:check` compares generated types without changing the tracked source file.

## Stack

- Next.js App Router with server-side Supabase sessions
- React 19 and TypeScript
- Tailwind CSS v4
- shadcn `base-lyra` preset with neutral tokens and Lucide icons
- Supabase Auth, Postgres, RLS, private avatar Storage, and server-only Calendar/scheduler/timer data
- Google Calendar provider integration
- Vercel for production hosting

## Project map

```text
src/app/page.tsx                 Task workspace and recovery cache
src/app/login/                   Passwordless account entry
src/app/auth/                    Magic-link confirmation
src/components/auth-provider.tsx Session, profile, and account settings
src/components/google-calendar-panel.tsx Planner and Calendar presentation
src/lib/google/                  Provider client, sync, and event rules
src/lib/scheduler/               Planning, queue, preferences, and repairs
src/lib/timer/                   Durable timer sessions and work history
supabase/migrations/             Append-only database changes
supabase/tests/database/         Database security and integrity checks
AGENTS.md                        Agent operating rules
ARCHITECTURE.md                  State ownership and reliability rules
design.md                        Visual and interaction authority
```
