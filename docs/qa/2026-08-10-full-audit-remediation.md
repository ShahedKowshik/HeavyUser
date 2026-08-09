# HeavyUser full audit — remediation and final evidence

Date: 2026-08-10 (Asia/Dhaka)
Baseline: `docs/qa/2026-08-10-full-audit-baseline.md` (kept frozen)
Working-copy commit base: `d5ba365bfb3240bf1ecbe938595ca86253727734`
Production deployment: **not changed**

## Plain-English result

The audited working copy is substantially safer and more reliable. All 12 confirmed P1 findings, all 18 baseline P2 findings, and all 5 baseline P3 findings received a local fix. The audit also found and fixed three extra issues: custom task order did not survive another device, the scheduler could skip a short opening today for a larger opening tomorrow, and invalid/expired/used email links were described too confidently.

No known P0 or P1 remains open in the working copy under the evidence available. This is **not yet a production release pass** because the live app still runs the older implementation, Google Chrome is unavailable for screenshot/browser proof, and no writable QA Google Calendar was available. Production was deliberately not deployed because the audit plan forbids deployment without a separate release request.

## Final proof layers

| Proof | Result | Current-run evidence |
|---|---|---|
| Master checklist coverage | PASS | All 183 inventoried rows have an explicit PASS, FAIL, or BLOCKED result; nothing untested was counted as passing |
| ESLint | PASS | No errors |
| TypeScript | PASS | No errors |
| Production build | PASS | Next.js 16.2.12 Webpack build; 20 pages generated and all 27 app/API routes collected |
| Unit and deterministic integration tests | PASS | 13 files, 113 tests |
| Dependency audit | PASS | Production and full audits both report no known vulnerabilities |
| Diff hygiene | PASS | `git diff --check` reports no whitespace errors |
| Linked migration parity | PASS | All 23 migrations match the linked Supabase project through `20260806030000` |
| Linked schema lint | PASS | No schema errors |
| Real Supabase ownership/RLS check | PASS | Two temporary `HU-QA` users; 12 own-read/write, cross-account, cross-Space, and private-table checks passed |
| Generated one-time auth link check | PASS | Six checks: safe destination, session cookie, authenticated API session, used-link rejection, unsafe redirect rejection, invalid-link handling |
| Signed-out local API behavior | PASS | GET and POST return JSON 401; foreign-origin POST returns JSON 403 |
| QA cleanup | PASS | Temporary auth users and task/Space rows removed; verified zero QA rows remain |
| Chrome mocked journeys | BLOCKED | Seven Chrome-only journeys are prepared and required in CI, but Chrome is not installed/connected locally |
| Local pgTAP behavior tests | BLOCKED | Docker/Podman is unavailable; linked metadata checks passed but the 30 local assertions were not executed |
| SMTP delivery and rate limiting | BLOCKED | Generated links prove the app/session path, not actual inbox delivery or provider rate limits |
| Google Calendar provider journeys | BLOCKED | A writable QA-only Google Calendar and one-time Google consent were unavailable |
| Authenticated live-app journeys | BLOCKED | No QA browser session; production intentionally remains on the old build |
| Screenshot/visual audit | BLOCKED | No Chrome means no honest desktop/tablet/phone, zoom, contrast, focus, touch, or pixel-shift screenshots |

## P1 remediation

| # | Confirmed issue | Working-copy result | Lasting protection |
|---|---|---|---|
| 1 | Signed-out APIs redirected to HTML login | FIXED | Proxy lets API handlers return JSON; local GET/POST proof returns 401 |
| 2 | Loading tasks before Spaces could erase a Sub-space | FIXED | Empty Space metadata no longer destroys valid references; unit coverage |
| 3 | An older save could finish after and overwrite a newer save | FIXED | Task writes are serialized and reconciled against a cloud baseline; queue tests |
| 4 | A stale tab could recreate a task deleted elsewhere | FIXED | Three-way reconciliation makes remote deletion win and preserves unrelated additions; conflict tests |
| 5 | Same-millisecond task IDs could collide | FIXED | UUID task IDs; deterministic uniqueness test |
| 6 | Events with attendees could be edited | FIXED | Guest events are view/open-only in UI and server PATCH rejects them |
| 7 | Timeline drag could overwrite a newer Google event | FIXED | Cached and provider ETags are checked for every edit path; conflict helper tests |
| 8 | Failed full sync deleted cache/tombstones before Google completed | FIXED | Fetch-first, commit-second replacement; stale-key regression coverage |
| 9 | OAuth reconnect could reuse another account's old refresh token | FIXED | Reconnect now requires a fresh refresh token |
| 10 | Disconnected Space could restore without current Google ownership | FIXED | Writable calendar access is rechecked before restore; Space tests |
| 11 | Inactive-calendar cleanup rows could starve active work | FIXED | Calendar filters now happen before batch limits for cleanup and timer repair |
| 12 | Lost timer responses could defeat retry receipts | FIXED | Add-time, manual-log, stop, and correction retries keep stable operation identity; idempotency tests |

## P2 remediation

| # | Confirmed issue | Working-copy result |
|---|---|---|
| 1 | Magic-link login lost the requested page | FIXED; real generated-link proof preserved `/settings?section=spaces` |
| 2 | Refreshed redirect cookies lost security attributes | FIXED; complete cookie objects are copied |
| 3 | Remote task load failed silently | FIXED; cached tasks stay visible, notice appears, retry runs |
| 4 | Every task-save failure said deletion failed | FIXED; action-neutral safe/retry message |
| 5 | Cache accepted invalid records or discarded every valid sibling | FIXED; strict per-record salvage and bounds tests |
| 6 | Inline title/duration/date paths could create invalid state | FIXED; the same limits now apply to every editor |
| 7 | `0.1` minute became zero | FIXED; rounded zero is rejected |
| 8 | Oversized scheduler limits became a generic database 500 | FIXED; UI/API validation and legacy clamping |
| 9 | Cross-Space busy events were editable | FIXED; busy-only events are read-only |
| 10 | Event edits used the wrong Space timezone | FIXED; each event's own timezone is preserved |
| 11 | Google calls and event listing were unbounded | FIXED; 15-second request timeout, 32-day range, and row limits |
| 12 | Deleted-task work history was inaccessible and repair stalled | FIXED; history remains visible under “Saved work from deleted tasks,” and missing-task repair can finish |
| 13 | Lock-release error could mask successful work | FIXED; release is best effort after a successful mutation; unit coverage |
| 14 | Missed-block Start could choose another block | FIXED; the explicitly requested missed block wins |
| 15 | `.env.local` was readable by other local users | FIXED; mode is `0600` |
| 16 | Six dependency advisories were open | FIXED; both audits now report none |
| 17 | Chrome E2E was absent from CI and defaulted to Chromium | FIXED IN CONFIG; Playwright now requires Google Chrome and CI installs/runs it. Execution remains blocked locally |
| 18 | Settings/Spaces failures lacked recovery actions | FIXED; inline retry and partial-success warnings added |

## P3 remediation

| # | Confirmed issue | Working-copy result |
|---|---|---|
| 1 | Calendar buttons replaced their button role with `listitem` | FIXED; the stage is a named group and events remain buttons |
| 2 | Profile/priority menus lacked arrow keys and focus return | FIXED IN CODE; Chrome proof remains blocked |
| 3 | Modals lacked focus trapping and return focus | FIXED IN CODE for task, calendar picker, and event dialogs; Chrome proof remains blocked |
| 4 | OAuth error paths retained one-time state cookies | FIXED; error redirects clear state and verifier cookies |
| 5 | Design documentation described the wrong task ordering | FIXED; documentation matches priority-first behavior and current views |

## Extra findings discovered during remediation

| Severity | Finding | Result |
|---|---|---|
| P2 | A manual custom order was saved as row positions but the UI forgot custom-order mode on reload/device | FIXED; the account stores the preference and switching task views no longer silently resets it |
| P2 | Near the end of a work window, the scheduler could skip a valid short block today and choose a larger block tomorrow | FIXED; candidate sizes now choose the earliest valid range; leap-day and year-boundary tests cover it |
| P3 | Supabase reports malformed, expired, and used OTPs with the same provider error, but HeavyUser guessed “expired” | FIXED; copy now truthfully says “invalid, expired, or already used”; real generated-link proof passes |

## Master checklist status delta

The frozen baseline remains the complete row-by-row inventory. Rows already marked PASS or BLOCKED remain unchanged unless named below. These working-copy rows move from FAIL/BLOCKED-by-missing-code to PASS-by-code/test or PASS-by-current-run service evidence:

- Accounts: `A06`, `A07`, `A10`, `A11`, `A12`; `A13` passes the JSON interface check but real browser session expiry remains blocked.
- Tasks: `T03`, `T07`, `T11`, `T12`, `T14`, `T21`–`T25`, `T27`–`T29`, `T35`.
- Spaces: `S08`, `S09`, `S15`.
- Calendar: `C02`–`C04`, `C06`, `C10`, `C11`, `C16`, `C20`, `C21`, `C26`, `C27`, `C29`–`C32`.
- Scheduler: `P09`, `P11`, `P12`, `P17`, `P19`, `P20`.
- Timer: `R10`, `R12`, `R14`, `R17`, `R23`, `R24`, `R26`.
- Settings/UX: `U05`, `U06`, `U08`–`U10`; keyboard/visual proof for `U07`–`U18` remains blocked where Chrome is required.
- Security/reliability: `Q01`, `Q04`, `Q06`–`Q08`, `Q11`–`Q14`, `Q16`, `Q18`, `Q19`, `Q27`, `Q28`.

The live column does **not** inherit these passes. The live signed-out scheduler API still returns `307 /login`, proving that production has not received the proxy fix.

## Screenshot audit

No screenshots are attached. Chrome was the required browser, and it was not available. Substituting Chromium, Safari, or Firefox would create false evidence. The Chrome suite is configured for 320, 390, 768, and 1280 pixel widths, accessibility scans, keyboard flows, focus behavior, error states, and responsive screenshots, but those seven journeys are still BLOCKED until Chrome is connected.

## Remaining limits and release recommendation

**Recommendation: HOLD production release.** The code quality gate is green and the working copy has no known open P0/P1, but release proof is incomplete.

The remaining one-time evidence needs are:

1. Connect Google Chrome so the seven mocked journeys and screenshot audit can run in the required browser.
2. Complete Google consent for one isolated QA calendar so event, sync, scheduler, timer, revoke, quota/failure, and cleanup journeys can run without touching personal data.
3. Confirm real SMTP delivery with a QA inbox; generated-link behavior already passes.
4. On a separate release request, deploy the intended commit, verify Vercel serves that exact SHA, then rerun critical and previously failing journeys on `web.heavyuser.app`.

No Google events or files were created in this run. All temporary Supabase users and `HU-QA` rows were removed. No database migration or breaking public API change was added; timer stop gained one backward-compatible internal retry identifier.
