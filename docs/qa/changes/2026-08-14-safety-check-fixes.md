# Change contract: safety checker fixes

Date: 2026-08-14 (Asia/Dhaka)
Change ID: 2026-08-14-safety-check-fixes

## Goal

- Make the safety checker look at the real files changed in a pull request or
  push.
- Stop an old Markdown contract from being reused for new risky work.
- Detect task, Spaces, settings, authentication, database, and security files.
- Require every detected risk area to be written in the manifest.

## Out of scope

- No product feature, user screen, API behavior, database table, or migration
  changes.
- No live Google Calendar, email, or signed-in-account proof is needed for this
  checker-only work.

## Affected systems and risks

- Risk areas: `auth`, `calendar`, `scheduler`, `persistence`, `retry`,
  `lifecycle`, `timer`, `supabase`, `security`, and `ui-lifecycle`.
- Files changed are limited by `.heavyuser/change-manifest.json`.
- Expected migrations: none.
- Main risk: a safety rule could be too weak and let an unsafe change pass, or
  too strict and make a small wording/color change unnecessarily heavy.

## Source of truth and ownership

| Area | Source of truth | Derived or cached data | Owner and rule |
| --- | --- | --- | --- |
| Changed files | Git comparison base and working tree | Checker output | Contract, scope, and release checks use the same base. |
| Change identity | Manifest `changeId` and contract `Change ID` | None | The IDs must match exactly. |
| Risk classification | Changed-file rules in `heavyuser-check-contract.mjs` | Manifest `riskAreas` | Every detected area must be declared. |
| Evidence | Contract matrix | CI output | `BLOCKED` and `NOT RUN` never mean `PASS`. |

## State and failure contract

- A risky mutating change must have a new or changed contract in the current
  work.
- The manifest and Markdown file must use the same Change ID.
- A pull request compares with its starting version; a normal push compares
  with the previous commit; a first push compares with the empty tree.
- A security change needs the same full contract as Calendar, Auth, or Timer
  work.
- Low-risk wording or color-only work may remain lightweight when it is clearly
  classified as low risk.

## Concurrency, retries, and time

- This change does not add product requests, retries, timers, provider calls, or
  timestamps.
- The checker must give the same answer for the same manifest, contract, and
  changed-file list.
- Pull-request, push, and first-push comparisons must not silently become an
  empty change list.

## User-visible recovery

- A missing or old contract gives a clear failure before the other checks pass.
- A wrong Change ID names both the expected and found values.
- Missing risk labels name every missing label.
- A blocked provider or browser check stays `BLOCKED` and includes a reason.

## Edge-case and evidence matrix

| Area | Scenario | Expected result | Test/evidence | Layer | Status | Reason or link |
| --- | --- | --- | --- | --- | --- | --- |
| Comparison | Pull request, normal push, or first push | The correct comparison point is selected | Contract unit tests and CI workflow check | local | PASS | Tests cover the pull-request base, push predecessor input, empty-tree first-push fallback, and one shared CI variable. |
| Fresh contract | Missing, unchanged, or wrong-ID contract | Check fails with a clear reason | Contract unit tests | local | PASS | Tests cover missing file, old file, and mismatched Change ID. |
| Fresh contract | New or untracked contract with matching ID | Check passes | Contract unit tests | local | PASS | New-contract cases use the current changed-file list and matching IDs. |
| Manifest safety | Invalid `allowedPaths` data | Check fails with a clear message instead of crashing | Contract unit test | local | PASS | The checker rejects non-string path patterns and the test covers the malformed case. |
| Risk detection | Task screen, Spaces API, settings, login, proxy, migration, or workflow changes | All relevant risks are detected | Contract unit tests | local | PASS | Tests cover each required file group. |
| Risk labels | One file affects several systems | Every detected label is required | Contract unit test | local | PASS | Google-library coverage fails when retry/lifecycle labels are omitted. |
| Security | Security-related file changes | Full contract is required | Contract unit test | local | PASS | Security is treated as high risk. |
| Small change | Wording or color-only change | No unnecessary full contract | Contract unit test | local | PASS | A low-risk UI-only example remains lightweight. |
| Evidence | Blocked or not-run provider proof | It cannot be reported as passed | Contract rules and existing release check | code | PASS | Allowed statuses and reasons remain enforced. |
| Product behavior | Application, database, and user screens | They stay unchanged | Existing test, build, and database checks | local | PASS | This work changes only safety documentation, scripts, and CI wiring. |

## Rollback and cleanup

- Revert the checker, tests, manifest, contract, instructions, and CI changes
  together.
- No user data, provider event, database object, migration, generated file, or
  test account is created.
- Keep the earlier process audit as historical explanation.
