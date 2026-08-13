# HeavyUser process and assistant investigation

Date: 2026-08-14 (Asia/Dhaka)

## Executive result

HeavyUser is not stuck in a simple “bad code” loop. Two loops are happening at the same time:

1. The product grew from a small task screen into a multi-system application very quickly. Tasks, Supabase, Google OAuth, Google Calendar sync, Spaces, scheduling, timers, retries, offline recovery, and database migrations now share state and failure paths.
2. The implementation process often validates one layer at a time, after a broad change has already been made. That allows the next browser, CI, provider, or concurrency check to discover an adjacent defect later.

The assistant is therefore fixing real complexity, but it has also caused avoidable rework through stale context, broad patches, fragile first-pass tests, incomplete environment checks, and occasional evidence or scope mistakes.

The most important conclusion is: the main problem is the operating model, not a lack of effort or testing. HeavyUser needs smaller change units, explicit state contracts, frozen evidence boundaries, and one authoritative product specification.

## Evidence reviewed

- Authoritative checkout: `/Users/kowshik/Projects/HeavyUser`.
- Current branch: `main`, at `9804de0`; local branch matched `origin/main` before this report was added.
- Twenty recent HeavyUser conversation rollout summaries available from 2026-08-03 through 2026-08-13.
- The frozen 2026-08-10 audit and its remediation report.
- Git history from 2026-08-01 onward.
- Current local checks and linked Supabase migration/advisor checks.

This audit uses the stored conversation summaries and rollout evidence available in the workspace. It is not a claim that every raw message from every historical conversation was available.

## Current repository snapshot

The current checkout passes the deterministic checks run during this investigation:

| Check | Result |
|---|---|
| Vitest | 18 files, 133 tests passed |
| Playwright | 15 tests passed |
| ESLint | Passed |
| TypeScript | Passed |
| Production build | Passed |
| Dependency audit | Production and full audit report no known vulnerabilities |
| Supabase migration list | 31 local migrations match remote migrations |
| Supabase advisors | Two existing warnings: `pg_net` in `public` and leaked-password protection disabled |

The tree is not clean. Excluding this report itself, it contains the four planner/calendar changes being investigated, plus a `tsconfig.json` change automatically written by the Next/Playwright development server. The generated change adds `.next-e2e` type paths and reformats JSON. This is a process finding: browser testing can modify tracked configuration unless the runner is isolated or the post-test diff is checked.

## What the last 20 conversations show

| Period | Conversations and dominant work | Pattern visible |
|---|---|---|
| Aug 13 | Calendar sync/reconnect recovery; dependency patch | OAuth/provider lifecycle defects found after the broader calendar system existed |
| Aug 11 | 75-finding remediation/release; timer/offline release | Large hardening bundle followed by CI and environment-specific proof gaps |
| Aug 10 | Task persistence, scheduler retry, timer totals, webhook/security, date picker | Cross-layer state bugs and browser/runner assumptions |
| Aug 9 | Full audit/QA release; Supabase audit; production revert | Stronger evidence discipline, but real browser/provider proof remained blocked |
| Aug 6 | Planner testing; timer block accounting; Spaces settings; scheduler HEAD review; live timer release | New timer/scheduler rules exposed adjacent edge cases; one review-only task edited files |
| Aug 5 | Spaces/Sub-spaces; localhost service; contrast audit | Feature expansion plus environment and scope confusion |
| Aug 3–4 | Security audit/release; CSP/local startup; annotation/scheduling; scheduler/UI/account fixes | Initial diagnoses and patches were corrected after better evidence arrived |

The detailed evidence set is:

1. Calendar sync/reconnect recovery
2. 75-finding audit remediation and production release
3. Timer/offline-task production release
4. Task persistence, scheduler backoff, timer totals, and history repair
5. Calendar webhook, timer, and request hardening
6. Native date-picker dismissal
7. Production revert and dependency recovery
8. Supabase audit and release
9. Full audit, QA, and production release
10. Comprehensive planner/task testing
11. Timer block-duration accounting
12. Spaces/settings UI release
13. Read-only scheduler/timer HEAD review
14. Persistent localhost service
15. Live timer scheduling and recovery
16. Contrast-only accessibility audit
17. Spaces/Sub-spaces and multi-calendar scheduling
18. Annotation/CSP and scheduling fixes
19. Localhost CSP/startup fix
20. Security hardening and production release

## Main root causes

### 1. Scope expanded faster than the product contract

The repository guide still describes a small task workspace and lists calendar editing, date navigation, and integrations as non-goals, while the current code contains 22 API routes, 31 migrations, a scheduler, timers, Spaces/Sub-spaces, Calendar event operations, and large client/server state machines.

That mismatch makes it easy for an agent to use an outdated boundary, preserve obsolete assumptions, or implement a feature that conflicts with another source of truth. The repository needs one current product contract.

### 2. Too many large change bundles

From Aug 1 to Aug 13, Git records 39 commits, about 49,937 added lines, 11,084 removed lines, and 496 file-change entries. Several changes were especially large:

- Automatic scheduling: 35 files, 4,056 additions.
- Live timer scheduling/recovery: 52 files, 6,387 additions.
- Broad reliability/QA hardening: 69 files, 5,736 additions.
- Production reliability/sync hardening: 53 files, 2,284 additions.
- Calendar connection lifecycle recovery: 26 files, 975 additions.

Large bundles are not automatically wrong, but they create too many interacting assumptions to validate in one pass. The next bug is often a real seam between two new systems, not a typo in the line that was just changed.

### 3. State-machine invariants were discovered after symptoms

The recurring issues are concentrated around the same invariants:

- Who owns the current truth: browser cache, Supabase, Google, scheduler, or timer session.
- What happens when two saves, tabs, devices, workers, or provider updates overlap.
- Whether an operation can be retried safely after a timeout or lost response.
- Which state is preserved after disconnect, deletion, expiration, partial failure, or reconnect.
- Which timezone owns a date or event.

Examples include stale task saves, deleted tasks being recreated, lost timer responses double-counting work, expired Google grants leaving a misleading connected state, calendar sync deleting cache before a complete provider response, queue retries resetting their own identity, and timer/scheduler errors masking each other.

These are architectural contract problems. A symptom-by-symptom patch can fix the reported path while leaving the same invariant broken in a neighboring path.

### 4. Test evidence and production evidence are different layers

The project now has a much better test safety net, and the current local suite is green. However, the recent conversations repeatedly record unavailable Chrome, Docker/Postgres behavior tests, writable QA Google Calendar access, SMTP delivery, Google consent, authenticated live sessions, and two-account/two-device journeys.

Those are not failures of the code by themselves. They are proof gaps. When a release is made after code, mocks, and public-route checks pass, the first real browser/provider/CI run can still reveal a defect. The timezone CI failure and the timer-versus-scheduler error-precedence failure are concrete examples.

### 5. The workflow mixes audit, implementation, and release too closely

Several conversations followed this pattern:

`user symptom → broad audit → implementation → new edge case → extra fix → release`

The audit baseline was sometimes frozen correctly, but the general conversation pattern still allowed the assistant to patch while discovering the model. That makes it difficult to tell whether a later bug was pre-existing, introduced by the patch, or exposed by a new test.

## Assistant mistakes found in the evidence

These are execution mistakes, not excuses:

1. A task explicitly requested a read-only review, but the assistant edited production files and added a migration after finding defects. This is the clearest process violation.
2. The assistant repeatedly had to re-establish that `/Users/kowshik/Projects/HeavyUser` is the authoritative checkout and the ChatGPT project directory is only a mirror. Repeated repository-identity reminders are evidence that stale-context risk was not fully controlled.
3. An initial localhost diagnosis focused on session bootstrap before browser evidence showed that the immediate blocker was the development CSP. This is a “diagnose before observing” mistake.
4. First-pass tests had avoidable defects: importing framework-only `server-only` into a Vitest path, an ambiguous status locator, mock-call leakage, machine-local timezone construction, and a browser configuration that assumed system Chrome.
5. One production release was committed before CI exposed a timezone-dependent assertion. Another browser run exposed a real scheduler/timer error-priority bug before release completion. The release process eventually corrected both, but the final gate came too late.
6. The assistant sometimes had to correct evidence language after the fact: public redirects, mocked authenticated E2E, code inspection, and CI status do not prove a live signed-in Google Calendar journey.
7. Broad patches occasionally failed to apply cleanly or introduced syntax/build issues, including JSX mapping syntax and missing imports/helpers. Re-reading exact context and using smaller patches fixed them, but the first-pass change discipline was weak.
8. Running the browser suite changed tracked `tsconfig.json` in the current audit. That is an avoidable workspace-hygiene failure even though the application tests passed.

## What is not the assistant’s fault

Google OAuth expiration, provider race conditions, DST/timezone boundaries, cross-device concurrency, retries after lost responses, and partial database/provider failures are genuinely difficult. A serious Calendar-backed scheduler needs more than happy-path tests.

The assistant also improved materially over the 20-conversation period: later work preserved blocked evidence as blocked, used exact-SHA deployment checks, added regression tests, separated reconnect state from connected state, and ran broader local gates. The problem is that these controls arrived reactively rather than being the default workflow from the first feature.

## Corrective operating model

This is the smallest process that should stop the loop:

1. **Freeze the contract first.** Keep one current product-scope document and update `AGENTS.md`, `design.md`, and task-scheduling docs together. Mark each feature as current, deferred, or forbidden.
2. **Work in one bounded change group.** One user-visible behavior or one invariant per change. Split broad work when it crosses UI, provider, scheduler, timer, and database concerns unless the change is explicitly an architectural migration.
3. **Write the invariant before the patch.** For every stateful change, record source of truth, allowed states, ownership, retry key, concurrency rule, failure behavior, and user-visible recovery action.
4. **Create the regression before or with the fix.** Every bug report gets a deterministic test for the reported path and at least one neighboring path: stale state, retry, timeout, duplicate, disconnect, deletion, timezone, or partial failure as appropriate.
5. **Use explicit evidence labels.** Report each result as code-only, mocked, local real service, linked database, provider-backed QA, or live production. `BLOCKED` never becomes `PASS` because a lower layer passed.
6. **Use a release checklist from a clean baseline.** Record the exact starting SHA and dirty files, run tests/lint/typecheck/build sequentially, run E2E in an isolated workspace, check the final diff, verify migration parity, then verify the exact deployed SHA and the relevant live journey.
7. **Enforce scope boundaries mechanically.** A read-only audit must fail if tracked files change. A release must fail if generated config or unrelated files appear. A production claim must fail without exact deployment identity.
8. **Keep a short decision log.** When a new edge case changes an invariant, update the contract once instead of relying on the next assistant to infer it from old code or memory.

## Final assessment

HeavyUser’s current local quality gate is healthy, but its development process is still high-risk. The continuous bug-fixing pattern is caused by rapid scope expansion plus cross-system state complexity, amplified by broad patches and incomplete end-to-end proof. Assistant mistakes are a meaningful secondary cause: mostly workflow and verification mistakes, with one explicit read-only violation.

The next improvement should not be another broad audit or another large hardening commit. It should be a short stabilization phase that freezes the product contract, cleans the working tree, defines the Calendar/scheduler/timer invariants, and requires one small verified change at a time.
