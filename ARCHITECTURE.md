# HeavyUser architecture and reliability contract

This file is the shared state contract for HeavyUser. Product behavior may
grow, but a change must not silently change who owns truth, how retries work,
or what survives a partial failure.

## Source of truth

| Area | Authoritative source | Local or derived data | Required rule |
|---|---|---|---|
| Tasks | Supabase task rows and their versions | Account-scoped browser cache | Cloud success updates the recovery baseline; failed saves never make an unconfirmed local copy the new baseline. |
| Google Calendar | Google Calendar provider | Local Calendar cache and schedule snapshots | Fetch first, commit second; provider identity, ETags, ownership, and the owning timezone must survive every edit path. |
| Spaces | Supabase Space/Sub-space rows plus verified Calendar ownership | UI selections and cached metadata | Only active, currently writable Spaces can plan, repair, clean up, or start a new timer. Disconnected history remains visible but inactive. |
| Scheduler | Durable schedule blocks, status, queue rows, and user lock | UI snapshots | A worker keeps the claimed queue-row identity; retries use stable request identity and bounded backoff. |
| Timer | Persisted sessions, work history, totals, and operation receipts | Live elapsed display | Retried mutations reuse their operation identity. Actual work and scheduled work remain separate. |
| Auth | Supabase session and server-side ownership checks | Browser auth state | Account data is scoped by user. Protected APIs return JSON errors, not HTML redirects. |
| Time | Explicit ISO/UTC instants plus the owning planning or Calendar timezone | Formatted local labels | Tests never depend on the machine timezone. All-day events use the owning Calendar timezone. |

## State transitions

Calendar connection state must distinguish `connected`, `requires_reconnect`,
`disconnected`, and `archived`. An expired or revoked OAuth grant becomes
`requires_reconnect`; it is never presented as healthy and must not start a
retry loop.

Disconnect stops unsafe active timers first, preserves historical Space and
work records, pauses new scheduling, removes or marks local provider cache as
inactive, and leaves provider cleanup recoverable after reconnect.

Scheduler and timer operations must be safe across duplicate requests, lost
responses, worker retries, concurrent tabs, concurrent devices, and provider
timeouts. A successful mutation must not be reported as failed only because a
best-effort lock release or cleanup step failed.

## API and error contract

- Signed-out `/api/*` requests return JSON `401`; page navigation may redirect
  to login.
- Unsafe return paths are rejected and valid internal paths survive the auth
  callback.
- Validated Calendar webhook work that fails returns retryable `5xx`; ignored
  or invalid notifications may acknowledge with `204`.
- Provider errors are normalized into actionable reconnect, conflict, quota,
  timeout, or retry states without exposing credentials or internal details.
- Existing public route shapes remain backward compatible unless a migration
  plan explicitly records an intentional change.

## Change contract

Every implementation change is declared in `.heavyuser/change-manifest.json`.
The manifest records the change type, mode, baseline SHA, allowed paths,
required checks, evidence level, and migration impact.

For a release manifest, also declare `releaseClass` as `ui` or `integration`
and record non-secret `releaseEvidence`. Every release needs the exact
deployed SHA, migration parity, post-deployment checks, and a clean tree.
Integration releases additionally need isolated provider-QA and authenticated
smoke proof. `pnpm check:release` enforces that declaration and rejects an
integration release that claims only public-route or mocked evidence.

Every bug fix must include:

1. the invariant that was broken;
2. the smallest production-path fix;
3. a deterministic regression test;
4. at least one neighboring failure case when concurrency, retries,
   timezones, ownership, or partial failure is involved;
5. evidence labeled by layer: code, mocked, local, linked-database,
   provider-qa, or production.

## Release contract

Changes involving Auth, Supabase data, Calendar, Spaces, scheduler, or timers
require isolated QA account data, a writable QA Calendar where relevant, QA
email proof where relevant, linked migration parity, exact deployed SHA, an
authenticated smoke journey, and a clean tree. A public HTTP response alone
cannot satisfy this contract.
