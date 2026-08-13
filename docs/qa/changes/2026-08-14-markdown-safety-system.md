# Change contract: Markdown safety system

Date: 2026-08-14 (Asia/Dhaka)
Change ID: 2026-08-14-markdown-safety-system

## Goal

- Add a small Markdown contract and evidence workflow for risky HeavyUser work.
- Make the change manifest and CI reject missing contracts, invalid evidence
  statuses, and incomplete integration-release proof.

## Out of scope

- No product behavior, public API, database table, migration, or user-facing UI
  change.
- No live Google Calendar, email, or authenticated-account smoke test is needed
  for this documentation and tooling change.

## Affected systems and risks

- Risk areas: `auth`, `process`, `persistence`, `retry`, `lifecycle`, `calendar`,
  `scheduler`, `timer`, `supabase`, `security`, and `ui-lifecycle`.
- Allowed paths are declared in `.heavyuser/change-manifest.json`.
- Expected migrations: none.
- Boundaries: Markdown, manifest validation, Node safety scripts, package
  scripts, CI, and existing agent/architecture guidance.

## Source of truth and ownership

| Area | Source of truth | Derived or cached data | Owner and rule |
| --- | --- | --- | --- |
| Daily agent behavior | `AGENTS.md` | Agent working context | Start and finish rules live here. |
| Reliability invariants | `ARCHITECTURE.md` | Code and tests | State ownership and failure rules live here. |
| Work-specific contract | `docs/qa/changes/*.md` | Change manifest pointer | The contract must exist before risky coding. |
| Machine enforcement | `scripts/heavyuser-check-contract.mjs` | CI output | Missing or malformed contracts fail the check. |

## State and failure contract

- Mutating high-risk work must have a `planFile` in the change manifest.
- The manifest `changeId` must match the `Change ID` in this file, and this file
  must be new or changed in the current work.
- Every risk area detected from changed files must be listed in the manifest.
- Low-risk UI or documentation work may omit a plan file when its risk area is
  explicitly classified as low risk.
- Every evidence row must use `PASS`, `BLOCKED`, `NOT RUN`, or `N/A`.
- `BLOCKED` and `NOT RUN` never count as successful provider or release proof.
- Integration releases must have provider/auth evidence and no unresolved
  blocked or not-run rows.

## Concurrency, retries, and time

- The contract checker must behave deterministically for the same manifest and
  Markdown file.
- No product timestamps or provider calls are introduced by this change.
- Existing Calendar, Scheduler, Timer, retry, and timezone rules remain owned by
  `ARCHITECTURE.md` and must be listed in future risky contracts.

## User-visible recovery

- A missing contract produces a clear command-line error before coding checks
  continue.
- An invalid evidence status or missing reason identifies the exact Markdown row.
- A blocked provider journey remains visibly blocked in the record instead of
  being described as passed.

## Edge-case and evidence matrix

| Area | Scenario | Expected result | Test/evidence | Layer | Status | Reason or link |
| --- | --- | --- | --- | --- | --- | --- |
| Contract gate | High-risk manifest has no `planFile` | Check fails | Contract checker test | local | PASS | Missing-plan case is covered by the Node contract tests. |
| Contract gate | Matrix has an invalid status or missing blocked reason | Check fails | Contract checker test | local | PASS | Invalid-status and missing-reason cases are covered by the Node contract tests. |
| Test runner | Contract tests must not be treated as an empty Vitest suite | Node test file stays outside Vitest discovery | `pnpm test:contracts` and `pnpm test -- --run` | local | PASS | The Node test file uses a non-Vitest filename and both runners pass. |
| Classification | Low-risk UI-only manifest omits a plan | Check passes with explicit classification | Contract checker test | local | PASS | Low-risk exemption is covered by the Node contract tests. |
| Scope | Contract file is outside declared allowed paths | Scope check fails | Existing scope gate plus manifest path validation | code | PASS | The contract path must be under `docs/qa/changes/` and match allowed paths. |
| Read-only work | Audit changes application code | Scope check fails | Existing read-only mode guard | code | PASS | Read-only application/test/migration/config changes are rejected. |
| Workspace | E2E changes tracked configuration | Runner restores and fails on new drift | Existing E2E workspace guard | code | PASS | Existing generated-file and E2E guards remain enabled. |
| Release proof | Integration release has blocked provider/auth evidence | Release check fails | Release-contract validation | code | PASS | Integration releases reject blocked or not-run evidence rows. |
| Provider proof | Only mocked E2E or a public route is available | It cannot satisfy provider proof | Evidence rules in template and release check | code | PASS | Mocked and public evidence remain separate from provider-QA evidence. |
| Product behavior | No product or database behavior changes | Runtime behavior remains unchanged | Existing verification suite | code | PASS | This change adds only documentation and safety tooling. |
| Live provider | Real Google/email/account journey | No live proof required here | Environment-dependent smoke test | code | N/A | This change does not modify provider behavior. |

## Rollback and cleanup

- Revert the documentation, manifest, script, package, and CI changes together.
- No provider data, database data, migration, generated file, or test account is
  created by this change.
- Keep the process audit as historical evidence even if the safety system is
  later refined.
