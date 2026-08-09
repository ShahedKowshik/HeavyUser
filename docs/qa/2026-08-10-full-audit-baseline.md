# HeavyUser full audit — frozen baseline

Date: 2026-08-10 (Asia/Dhaka)
Scope: unfinished working copy plus live `web.heavyuser.app`
Browser scope: Google Chrome only
Status: frozen before remediation; later fixes must be recorded in a separate report

## Status rules

- **PASS** means there is current-run automated, database-metadata, HTTP, or direct code-path evidence for the stated result.
- **FAIL** means the audit reproduced or directly proved a defect.
- **BLOCKED** means the required environment, account, or browser was unavailable. A blocked row is not a pass.
- Code inspection is named explicitly where it is the only evidence. It does not replace a real-account journey.

## Frozen build and test baseline

| Check | Working copy | Live app | Evidence |
|---|---|---|---|
| Repository identity | PASS | BLOCKED | Authoritative checkout is `/Users/kowshik/Projects/HeavyUser`; `HEAD` and `origin/main` are both `d5ba365bfb3240bf1ecbe938595ca86253727734`. Vercel deployment-to-commit identity is unavailable without deployment metadata. |
| Dirty working copy preserved | PASS | — | Existing modified and untracked files were inventoried before audit edits. |
| ESLint | PASS | — | Current-run lint completed with no errors. |
| TypeScript | PASS | — | Current-run type-check completed with no errors. |
| Production build | PASS | — | Current-run Next.js Webpack build completed; 20 routes built. |
| Unit tests | PASS | — | Current-run Vitest: 8 files, 84 tests passed. |
| Browser E2E files | BLOCKED | BLOCKED | Seven mocked E2E cases are present but uncommitted and use Playwright's default Chromium. Chrome is unavailable and the selected-browser rule forbids substitution. |
| Database migration parity | PASS | — | All 23 local migrations match the linked Supabase project through `20260806030000`. |
| Database schema lint | PASS | — | Linked schema lint returned no warnings. |
| Database behavior tests | BLOCKED | — | The local Docker/Podman database runtime is unavailable; the 30 pgTAP assertions could not run in this session. |
| Production dependency audit | FAIL | FAIL | `nanoid` 3.3.16 has one high advisory; patched in 3.3.17. The live app is presumed affected until deployment identity proves otherwise. |
| Full dependency audit | FAIL | — | Six advisories: two high, three moderate, one low (`nanoid`, `js-yaml`, and `hono`). |
| Tracked-secret scan | PASS | — | No tracked key material matched the repository scan. |
| Local secret-file permissions | FAIL | — | `.env.local` is ignored but readable by other local users (`0644`). Expected `0600`. |
| Public route and security headers | — | PASS | `/login` returns 200 with CSP, HSTS, no-store, frame denial, MIME sniffing protection, referrer policy, and permissions policy. |
| Authenticated visual screenshots | BLOCKED | BLOCKED | Chrome is not installed/connected, so desktop, tablet, phone, zoom, keyboard, and screenshot proof cannot honestly be produced. |

## Master product checklist

### Accounts, sessions, profile, and navigation

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| A01 | Open signed-out login screen | Login renders without exposing private workspace data | PASS (build/code) | PASS (HTTP 200) |
| A02 | Submit a valid email | One magic link is requested and a clear sent state appears | BLOCKED (QA email) | BLOCKED (QA email) |
| A03 | Empty or invalid email | Native/form validation prevents the request | PASS (code) | BLOCKED (Chrome) |
| A04 | Supabase email rate limit | A simple wait-and-retry message appears | PASS (code mapping) | BLOCKED (QA email) |
| A05 | SMTP/provider failure | A useful provider setup message appears | PASS (code mapping) | BLOCKED (QA email) |
| A06 | Valid magic link | Session is exchanged once and user lands on the requested safe page | FAIL | FAIL (same code path) |
| A07 | Expired, used, or invalid magic link | User returns to login with a precise, non-sensitive message | PASS (code) | BLOCKED (QA email) |
| A08 | Unsafe `next` redirect | External, protocol-relative, and backslash destinations are rejected | PASS (unit test) | BLOCKED (real link) |
| A09 | Protected page while signed out | Page redirects to login and remembers the destination | PASS | PASS (`/settings` -> `/login?next=%2Fsettings`) |
| A10 | Protected API while signed out | API returns JSON 401; it must not redirect to HTML login | FAIL | FAIL (live API returns 307) |
| A11 | Return to original page after login | `/settings` login returns to `/settings` | FAIL | FAIL (login discards `next`) |
| A12 | Session refresh on a redirect | Refreshed cookies keep their path, expiry, and security attributes | FAIL (code inspection) | BLOCKED (session) |
| A13 | Session expiry while workspace is open | UI reports session expiry and never treats redirected HTML as successful JSON | FAIL | BLOCKED (session) |
| A14 | Sign out | Session clears, account data disappears, and login opens | PASS (code) | BLOCKED (QA account) |
| A15 | Sign-out failure | User stays signed in and sees an error | PASS (code) | BLOCKED (QA account) |
| A16 | Switch between two HeavyUser accounts | Tasks/cache/settings never cross accounts | PASS (account-scoped keys/RLS inspection) | BLOCKED (two QA accounts) |
| A17 | Profile name: empty, whitespace, >80 characters | Save is rejected with a clear rule | PASS (code) | BLOCKED (QA account) |
| A18 | Avatar: JPG/PNG/WebP <=2 MB | Private upload succeeds and old avatar is removed after profile save | PASS (code path) | BLOCKED (QA account) |
| A19 | Avatar: wrong type or >2 MB | Upload is rejected before storage write | PASS (code) | BLOCKED (QA account) |
| A20 | Avatar storage privacy | Only the owning user can read/write their folder | PASS (policy inspection) | BLOCKED (two QA accounts) |
| A21 | Copy public user ID | Copy succeeds or shows a fallback error | PASS (code) | BLOCKED (Chrome) |
| A22 | Profile menu keyboard behavior | Trigger, items, Escape, and focus return work as a menu | BLOCKED (Chrome) | BLOCKED (Chrome) |

### Tasks, views, persistence, and multi-tab behavior

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| T01 | Empty task list | Useful empty state; no fake task | PASS (mocked E2E source/code) | BLOCKED |
| T02 | Add normal task | Unique task is focused when no other focus exists | PASS (unit/code) | BLOCKED |
| T03 | Add two tasks in the same millisecond | Both retain unique IDs and persist | FAIL | FAIL (same implementation) |
| T04 | Empty/whitespace title | Add is rejected | PASS (mocked E2E source/code) | BLOCKED |
| T05 | 240-character title | Accepted | PASS (code) | BLOCKED |
| T06 | >240 title in composer/modal | Input/save is rejected | PASS (code) | BLOCKED |
| T07 | >240 title through inline edit | Input/save is rejected without rolling back other tasks | FAIL | BLOCKED |
| T08 | Emoji, punctuation, and Unicode title | Text persists without corruption or injection | PASS (mocked E2E source/code) | BLOCKED |
| T09 | Duration missing | Task stays valid and scheduler says duration is needed | PASS (unit/code) | BLOCKED |
| T10 | Duration 1 through 10,080 minutes | Valid boundary values persist | PASS (unit/code) | BLOCKED |
| T11 | Fractional duration below 0.5 | Must not normalize to zero | FAIL (`0.1` becomes `0`) | BLOCKED |
| T12 | Custom duration over 10,080 | UI rejects it before remote save | FAIL | BLOCKED |
| T13 | Start date after deadline | Composer and full editor reject it | PASS (mocked E2E source/code) | BLOCKED |
| T14 | Inline due date before existing start date | Change is rejected with a clear message | FAIL | BLOCKED |
| T15 | Valid leap day; invalid leap day/month date | Valid date accepted; invalid date rejected | PASS (unit) | BLOCKED |
| T16 | Priority changes | Urgent/high/normal/low save and sort deterministically | PASS (unit/mock source) | BLOCKED |
| T17 | Complete and reopen | Exactly one open task remains focused | PASS (unit/code) | BLOCKED |
| T18 | Complete task with running timer | Timer stops safely, actual work saves, task completes | PASS (code inspection) | BLOCKED (QA Google) |
| T19 | Delete ordinary task | Task disappears, provider cleanup is queued, next focus is selected | PASS (code inspection) | BLOCKED (QA Google) |
| T20 | Delete task with timer on another device | Database blocks deletion and UI restores cloud tasks | PASS (trigger/code inspection) | BLOCKED (two devices) |
| T21 | Two quick local saves with slow first request | Older response must never overwrite newer state | FAIL | BLOCKED |
| T22 | Delete in tab A, stale save in tab B | Deleted task must not be resurrected | FAIL | BLOCKED (two tabs) |
| T23 | Same task edited on two devices | Conflict is detected or clearly resolved; no silent lost update | FAIL (last writer silently wins) | BLOCKED |
| T24 | Remote load fails | Cached tasks remain and user is told cloud sync is paused | FAIL (cache remains, no notice) | BLOCKED |
| T25 | Remote save fails | Cloud version is restored and action-specific error appears | FAIL (always says delete failed) | BLOCKED |
| T26 | Corrupt cache JSON | App safely falls back without crashing | PASS (unit) | BLOCKED |
| T27 | One corrupt item among valid cached tasks | Valid items remain available offline | FAIL (entire cache is discarded) | BLOCKED |
| T28 | Invalid cached IDs, blank title, bad dates, oversized block limits | Invalid records never enter UI or remote save | FAIL | BLOCKED |
| T29 | Spaces load after tasks | Valid Sub-space assignment is preserved | FAIL (confirmed race) | BLOCKED |
| T30 | Account-scoped cache | User A cache is never loaded for User B | PASS (unit) | BLOCKED (two accounts) |
| T31 | All/Backlog/Today/Upcoming filters | Counts and membership follow logical date rules | PASS (unit/mock source) | BLOCKED |
| T32 | Show/hide completed | Completed rows appear only when requested | PASS (mock source) | BLOCKED |
| T33 | Mouse drag reorder | Visible order changes without losing hidden bucket tasks | PASS (unit/code) | BLOCKED |
| T34 | Keyboard reorder | Arrow keys reorder the focused row | PASS (code/mock source) | BLOCKED |
| T35 | Reorder survives reload/device | Explicit custom order remains the user's order | FAIL (custom-order mode is not persisted) | BLOCKED |
| T36 | Huge task list | Load, edit, save, filter, and scheduler remain responsive | BLOCKED (no safe QA dataset) | BLOCKED |
| T37 | Offline create/edit then reconnect | Local changes merge without loss or surprise deletion | BLOCKED (requires network-controlled Chrome) | BLOCKED |

### Spaces and Sub-spaces

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| S01 | Load Spaces | Only current user's Spaces/Sub-spaces return in stable order | PASS (query/RLS inspection) | BLOCKED |
| S02 | Add writable calendar as Space | Calendar is verified writable; duplicate tabs return one Space | PASS (code inspection) | BLOCKED (QA Google) |
| S03 | Add read-only/unavailable calendar | Server rejects it | PASS (code) | BLOCKED |
| S04 | Rename Space, including whitespace/121 chars | Valid trimmed name saves; invalid name is rejected | PASS (code) | BLOCKED |
| S05 | Archive Space with open tasks | UI/API/database all reject archive | PASS (code/trigger inspection) | BLOCKED |
| S06 | Archive Space with completed work only | Space archives and completed task links remain | PASS (code/FK inspection) | BLOCKED |
| S07 | Restore archived Space | Space becomes schedulable again | PASS (code) | BLOCKED |
| S08 | Restore disconnected Space under another Google account | Calendar ownership/writable access is re-verified first | FAIL | BLOCKED |
| S09 | Reconnect existing Space | Calendar name and timezone refresh without overwriting custom Space name | FAIL (metadata stays stale) | BLOCKED |
| S10 | Add Sub-space | Active parent required; duplicate name is rejected | PASS (code/constraint inspection) | BLOCKED |
| S11 | Archive Sub-space with open tasks | API/database reject it | PASS (code/trigger inspection) | BLOCKED |
| S12 | Keep completed task in archived Sub-space | Historical assignment remains | PASS (unit) | BLOCKED |
| S13 | Move task across Spaces/Sub-spaces | Future blocks leave old calendar; archived invalid labels are cleared | PASS (unit/code inspection) | BLOCKED (QA Google) |
| S14 | Disconnect Google | Spaces become disconnected; history remains | PASS (code/FK inspection) | BLOCKED (QA Google) |
| S15 | Space settings partial failure | Saved Space is not reported as wholly failed when later sync/queue work fails | BLOCKED (fault injection absent) | BLOCKED |

### Google Calendar, sync, events, and multi-Space behavior

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| C01 | OAuth state and PKCE | Random state/verifier are required and checked | PASS (code inspection) | BLOCKED (QA Google) |
| C02 | OAuth denial/missing code/bad state | Safe error redirect; one-time cookies are cleared | FAIL (cookies remain on errors) | BLOCKED |
| C03 | Reconnect without a new refresh token | Flow fails safely; it never reuses a different account's token | FAIL | BLOCKED |
| C04 | OAuth partial database failure | Previous connection/Space state is restored or transition is atomic | FAIL (no compensation) | BLOCKED |
| C05 | List calendars | Only writable calendars are offered; pagination works | PASS (code) | BLOCKED |
| C06 | Select first calendar | Connection, Space, initial sync, and scheduler are distinguishable outcomes | FAIL (scheduler failure reports whole selection as failed) | BLOCKED |
| C07 | Access-token expiry | Refresh token renews encrypted access token | PASS (code) | BLOCKED |
| C08 | Revoked/invalid token | User sees reconnect state; no personal data is deleted | PASS (code path) | BLOCKED |
| C09 | Initial full sync succeeds | Complete current provider state replaces cache and advances token | PASS (code path) | BLOCKED |
| C10 | Initial full sync fails before Google response | Existing cache/tombstones remain untouched | FAIL | BLOCKED |
| C11 | Expired sync token (410) | Safe full sync occurs without resurrecting locally deleted events | FAIL (tombstones are cleared) | BLOCKED |
| C12 | Incremental sync with no changes | No unnecessary scheduler job | PASS (code) | BLOCKED |
| C13 | Pagination/large calendar | All pages sync within time/memory quotas or stop safely | BLOCKED (QA dataset) | BLOCKED |
| C14 | Watch renewal | Expiring channel is replaced; token stored only as hash | PASS (code/schema inspection) | BLOCKED |
| C15 | Forged webhook | Always returns 204 and performs no sync without matching IDs/token | PASS (code) | BLOCKED |
| C16 | Webhook for archived/disconnected Space | No sync or scheduler work occurs | FAIL (archived Space still syncs) | BLOCKED |
| C17 | Create timed event | Valid title/range saves to selected active Space | PASS (code) | BLOCKED |
| C18 | Invalid range/oversized text | Server rejects before Google write | PASS (code) | BLOCKED |
| C19 | Edit ordinary event | ETag protects concurrent Google changes | PASS for modal edit (code) | BLOCKED |
| C20 | Drag/resize stale event | ETag conflict is shown; external time is never silently overwritten | FAIL | BLOCKED |
| C21 | Attendee event | View/open only; no edit, drag, resize, or delete | FAIL (edit and drag allowed; delete alone is blocked) | BLOCKED |
| C22 | All-day event | Rendered as all-day and remains read-only | PASS (code) | BLOCKED |
| C23 | Recurring instances | Instance identity includes original start; no collisions across instances | PASS (unit/code) | BLOCKED |
| C24 | Free/transparent event | Does not block scheduler/timer | PASS (unit/code) | BLOCKED |
| C25 | Busy event | Blocks planner and triggers timer overlap choice | PASS (unit/code) | BLOCKED |
| C26 | Cross-Space busy event | Reserves time but cannot be edited from another Space filter | FAIL | BLOCKED |
| C27 | Calendar-specific timezone | Edits use the event/Space timezone, not another selected calendar's timezone | FAIL | BLOCKED |
| C28 | Google 404/410 on owned delete | Delete remains idempotent | PASS (code) | BLOCKED |
| C29 | Google 409/412 on write | Duplicate/conflict is recovered without duplicate event | PASS for scheduler/create; FAIL for stale timeline overwrite | BLOCKED |
| C30 | Quota/network timeout | Request ends in bounded time and schedules retry | FAIL (Google fetch has no timeout) | BLOCKED |
| C31 | Disconnect after cleanup failure | User is warned and orphan cleanup remains recoverable | PASS (code inspection) | BLOCKED |
| C32 | Event cache list size | Planner API is bounded/paginated enough for huge calendars | FAIL (returns all cached rows) | BLOCKED |

### Scheduler

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| P01 | Priority ordering | Dated tasks, priority, deadline, then position are deterministic | PASS (unit) | BLOCKED |
| P02 | Start date/deadline | No block before start or after live deadline | PASS (unit) | BLOCKED |
| P03 | Past deadline | Task is marked late and remaining work is still schedulable | PASS (unit) | BLOCKED |
| P04 | Min/max block split | Work splits without unusable remainder | PASS (unit) | BLOCKED |
| P05 | Impossible plan | Missing minutes and warning are explicit | PASS (unit) | BLOCKED |
| P06 | No estimate | No guessed block; `needs_duration` state | PASS (unit/code) | BLOCKED |
| P07 | No active Space | No scheduling; clear paused warning | PASS (code) | BLOCKED |
| P08 | Working windows/weekends | Only configured windows are used | PASS (unit) | BLOCKED |
| P09 | Invalid/oversized scheduling limits | Server rejects or safely normalizes within DB bounds | FAIL (>10,080 reaches DB and becomes 500) | BLOCKED |
| P10 | Night Owl all-day boundary | Previous logical day remains open until configured time | PASS (unit) | BLOCKED |
| P11 | DST forward/back, non-hour timezone | Actual minutes remain correct and no invalid local range is produced | BLOCKED (missing explicit tests) | BLOCKED |
| P12 | Month/year/leap boundary | Dates cross correctly | PASS for task helpers; BLOCKED for full scheduler | BLOCKED |
| P13 | Busy and all-day events | Opaque timed/all-day reserve time; free/cancelled do not | PASS (unit) | BLOCKED |
| P14 | Locked/past blocks | Protected blocks do not move | PASS (unit/code) | BLOCKED |
| P15 | Priority force-replan | Future locks unlock; past blocks stay protected | PASS (code) | BLOCKED |
| P16 | Duplicate scheduler runs | Per-user lock and deterministic IDs prevent duplicates | PASS (schema/code) | BLOCKED (real concurrency) |
| P17 | Lock release failure after success | Successful schedule is not reported as failed | FAIL (release error masks result) | BLOCKED |
| P18 | Missed block | Provider event is removed/queued, block becomes missed, full minutes reschedule | PASS (code/unit) | BLOCKED |
| P19 | Multiple calendar cleanup queues | Active-calendar work is not starved by rows for inactive calendars | FAIL (filter occurs after limit) | BLOCKED |
| P20 | Timer repair queue with many calendars | Active-calendar repairs are not starved | FAIL (filter occurs after limit) | BLOCKED |
| P21 | Queue retries | Attempts back off and stale locks can recover | PASS (code/schema) | BLOCKED |
| P22 | Queue terminal failure | User-facing status remains truthful after 20 attempts | PASS (code) | BLOCKED |
| P23 | Scheduler worker secret | Missing/wrong bearer is rejected | PASS (code) | BLOCKED (secret) |
| P24 | Slow worker limit | Worker stops taking new jobs before runtime budget | PASS (code) | BLOCKED |

### Timer and work history

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| R01 | Start task with no estimate/Space/calendar | Clear validation; no partial session/event | PASS (code) | BLOCKED |
| R02 | Start in free time | One locked session/block/event starts at server-validated time | PASS (code) | BLOCKED |
| R03 | Start in busy time | User chooses overlap or next free; next-free leaves timer stopped | PASS (code/mock source) | BLOCKED |
| R04 | Start another task | Existing timer stops first; only one account timer remains | PASS (code/unique index) | BLOCKED (two devices) |
| R05 | Refresh/sign out/second device | Running timer remains account-owned | PASS (schema/code) | BLOCKED |
| R06 | Stale/future client clock | Old action conflicts; future skew clamps safely | PASS (code) | BLOCKED |
| R07 | Stop under one minute | Work stays in history; tiny provider event is removed | PASS (code) | BLOCKED |
| R08 | Reach estimate | User explicitly chooses stop/continue; task is not auto-completed | PASS (code/mock source) | BLOCKED |
| R09 | Overtime over max block | User chooses one long event or bounded split | PASS (code/mock source) | BLOCKED |
| R10 | Stop network timeout then retry | UI recognizes already-stopped success instead of false failure | FAIL | BLOCKED |
| R11 | Add time valid/invalid/max | 1–1,440 accepted; total capped at 10,080 | PASS (code) | BLOCKED |
| R12 | Add-time response lost then retried | Same retry key prevents double addition | FAIL (client generates a new key) | BLOCKED |
| R13 | Manual log valid/past/future/>24h | Valid past work saves; future and >24h reject | PASS (code) | BLOCKED |
| R14 | Manual-log response lost then retried | Same retry key prevents duplicate work | FAIL (client generates a new key) | BLOCKED |
| R15 | Log work on completed/no-estimate task | History-only; no guessed calendar event | PASS (code) | BLOCKED |
| R16 | Correct stopped work with reason | Original range is audited and owned event updates | PASS (code) | BLOCKED |
| R17 | Retry same correction after timeout | No duplicate revision for the same final range | FAIL | BLOCKED |
| R18 | Delete stopped work | Work becomes cancelled; event removal retries if needed | PASS (code) | BLOCKED |
| R19 | Delete/correct running work | Rejected until timer is stopped | PASS (code) | BLOCKED |
| R20 | Google edits/deletes active event | Timer pauses, owner clears, user gets review alert | PASS (code) | BLOCKED |
| R21 | App drag/resize active event | Server rejects while timer is active | PASS (code) | BLOCKED |
| R22 | Google failure during stop/correction/delete | Local work remains and repair is queued | PASS for common paths; BLOCKED for DB-failure compensation | BLOCKED |
| R23 | Task completion/deletion with work history | Historical session is retained and repairable | FAIL (task deletion leaves history inaccessible and task-dependent repair can no longer run) | BLOCKED |
| R24 | Missed block Start action | The selected missed block is handled before an unrelated future block | FAIL (future block wins selection) | BLOCKED |
| R25 | Repair after reconnect | Pending create/patch/delete resumes only for active matching Space | PASS (code) | BLOCKED |
| R26 | Timer lock release failure after success | Successful mutation is not reported as failed | FAIL | BLOCKED |

### Settings, accessibility, responsive UX, and performance

| ID | Use case / edge case | Expected result | Working copy | Live |
|---|---|---|---|---|
| U01 | Settings loading/error/empty | Clear non-jumping states | PASS (code) | BLOCKED (Chrome) |
| U02 | Save profile/rhythm/scheduler | Buttons disable during save and announce result | PASS (code) | BLOCKED |
| U03 | Night Owl toggle/day start | Disabled/enabled state and help text stay consistent | PASS (code) | BLOCKED |
| U04 | Working-window add/remove/all-day | Up to four valid windows/day; at least one global window | PASS (code) | BLOCKED |
| U05 | Scheduler load error then retry | User has an in-place retry without full page reload | FAIL (message only; no retry control) | BLOCKED |
| U06 | Spaces loading/calendar-list failure | Space error remains visible; calendar-list failure is not silently hidden | FAIL (calendar-list failure is discarded) | BLOCKED |
| U07 | Keyboard-only primary journeys | Every control is reachable/operable with visible focus | BLOCKED (Chrome) | BLOCKED |
| U08 | Dialog focus trap, Escape, return focus | Focus stays in modal and returns to trigger | BLOCKED (Chrome; no trap in code) | BLOCKED |
| U09 | Menu arrow-key behavior | Profile/priority menus follow menu keyboard conventions | BLOCKED (Chrome; handlers absent) | BLOCKED |
| U10 | Screen-reader control semantics | Interactive calendar events remain buttons, not list items | FAIL (`button` role is replaced by `listitem`) | BLOCKED |
| U11 | Status/error announcements | Async errors use alert; success uses status/live region | PASS for main paths; BLOCKED for full screen-reader proof | BLOCKED |
| U12 | Contrast | Text, focus, disabled, error, and status colors meet WCAG | BLOCKED (screenshot/browser measurement unavailable) | BLOCKED |
| U13 | Reduced motion | Animations/transitions stop or become negligible | PASS (CSS rule inspection) | BLOCKED |
| U14 | 200%/400% zoom | No clipped controls or overlap | BLOCKED (Chrome) | BLOCKED |
| U15 | 320/390/768/1280 layout | No horizontal overflow; 60/40 desktop and stacked mobile remain stable | BLOCKED (Chrome; mocked test exists but was not runnable) | BLOCKED |
| U16 | Touch targets and drag alternatives | Important controls have adequate targets and keyboard alternatives | BLOCKED (Chrome) | BLOCKED |
| U17 | No pixel jump | Open/close, save, timer, errors, and loading preserve geometry | BLOCKED (Chrome screenshots unavailable) | BLOCKED |
| U18 | Slow page/network | Useful skeleton/error before timeout; no infinite busy state | BLOCKED (network-controlled Chrome) | BLOCKED |

### Security, reliability, and API inventory

| ID | Interface / rule | Expected result | Working copy | Live |
|---|---|---|---|---|
| Q01 | `GET /api/auth/session` | Authenticated no-store user or JSON 401/503 | PASS handler; FAIL proxy for signed-out | FAIL (307) |
| Q02 | `GET /api/google/calendar/calendars` | Auth required; writable calendars only | PASS (code) | BLOCKED |
| Q03 | `GET /api/google/calendar/connect` | Auth + canonical redirect + PKCE cookies | PASS (code) | BLOCKED |
| Q04 | `GET /api/google/calendar/callback` | Auth/state/verifier required; safe completion/error | FAIL (token fallback/error-cookie issues) | BLOCKED |
| Q05 | `GET/DELETE /api/google/calendar/connection` | Own connection only; disconnect safely | PASS common path | BLOCKED |
| Q06 | `GET/POST/PATCH/DELETE /api/google/calendar/events` | Own rows/calendar only; validated writes; guest read-only | FAIL (guest/stale drag/timezone/unbounded list) | BLOCKED |
| Q07 | `POST /api/google/calendar/select` | Auth/origin/body/calendar access checks | PASS validation; FAIL partial-success reporting | BLOCKED |
| Q08 | `POST /api/google/calendar/sync` | Auth/origin; safe incremental/full sync | FAIL (destructive full-sync ordering) | BLOCKED |
| Q09 | `POST /api/google/calendar/webhook` | Hashed token/IDs; no oracle | PASS (code) | BLOCKED |
| Q10 | `GET /api/scheduler/process` | Secret bearer only; bounded worker | PASS (code) | BLOCKED |
| Q11 | `POST /api/scheduler/run` | Auth/origin; lock; safe retry status | PASS handler; FAIL signed-out proxy | FAIL (307) |
| Q12 | `GET/PUT /api/scheduler/settings` | Auth; validated limits/windows; saved result | FAIL (oversized limits/body streaming) | BLOCKED |
| Q13 | `GET /api/scheduler/status` | Auth; own status/blocks/timer only | PASS handler; FAIL signed-out proxy | FAIL (307) |
| Q14 | `GET/POST/PATCH /api/spaces` | Auth; access verification; archive guard | FAIL disconnected restore verification | BLOCKED |
| Q15 | `POST/PATCH /api/spaces/subspaces` | Auth; parent ownership; archive guard | PASS (code) | BLOCKED |
| Q16 | Timer start/stop/status/add/log/missed/session routes | Auth/origin/body/range/account checks | PASS common validation; FAIL idempotency/session-ID/body-stream edges | BLOCKED |
| Q17 | Cross-origin browser mutations | Foreign Origin/Sec-Fetch-Site returns 403 | PASS (unit) | BLOCKED |
| Q18 | Chunked/no-Content-Length body >64 KiB | Server returns 413 before JSON allocation | FAIL (header-only guard) | BLOCKED |
| Q19 | Oversized URL/route IDs | Server rejects bounded IDs before database query | FAIL for timer session/missed request fields | BLOCKED |
| Q20 | Database RLS/account isolation | Cross-account reads/writes fail for every private table | PASS by policy/privilege inspection; BLOCKED behavioral pgTAP | BLOCKED |
| Q21 | Sensitive service tables | `anon`/`authenticated` have no grants | PASS (migration inspection) | BLOCKED |
| Q22 | Task and Space foreign keys | Cross-user Space/Sub-space/block references fail | PASS (composite FK inspection) | BLOCKED |
| Q23 | Private avatar bucket | 2 MB/MIME limit and owner-folder policies | PASS (migration inspection) | BLOCKED |
| Q24 | Unsafe redirects | Canonical HTTPS origin and same-origin paths only | PASS (unit/code) | PASS public canonical redirect |
| Q25 | CSP and browser headers | Strict production policy; no frames/objects/sniffing | PASS (code) | PASS (HTTP) |
| Q26 | Private files/source maps | Secrets/config are not publicly served | PASS tracked scan/build defaults; BLOCKED exhaustive live paths | BLOCKED |
| Q27 | Dependency risk | No known high/critical advisory | FAIL | FAIL/identity BLOCKED |
| Q28 | CI gates | Lint/type/test/build/audit/database/secret/Chrome E2E required | FAIL (Chrome E2E absent; audit currently fails) | — |

## Frozen findings

No P0 issue was found in the evidence available in this session. The following issues are confirmed before fixes.

### P1 — core data, account, or calendar failures

1. **Signed-out API calls are redirected to HTML login instead of returning JSON 401.** Reproduce with `GET /api/scheduler/status` while signed out; live returns 307. Expected JSON 401. Cause: the proxy redirects every protected path, including `/api/*`. Regression: signed-out GET and POST API tests.
2. **Task restore can permanently clear a valid Sub-space.** Load tasks before Spaces. Expected assignment unchanged until Spaces arrive; actual mapping with an empty Space list clears `subSpaceId`, then sync can persist it. Cause: two independent effects plus destructive empty-list mapping. Regression: empty-Space mapping and delayed-Space E2E.
3. **An older task save can overwrite a newer save.** Delay save A, complete save B, then complete A. Expected B remains; actual A can win. Cause: debounce cancels callbacks but not in-flight requests. Regression: deferred-request save ordering test.
4. **A task deleted in one tab can be recreated by a stale tab.** Expected remote deletion wins or conflicts; actual stale full-list upsert recreates it. Cause: no three-way baseline/tombstone/version check. Regression: two-tab delete-versus-stale-save test.
5. **Task IDs can collide.** Two adds in one millisecond both use `task-${Date.now()}`. Expected unique stable IDs. Regression: deterministic same-clock ID test.
6. **Attendee events are not read-only.** UI permits modal edit and drag/resize; PATCH sends guest notifications. DELETE alone blocks. Expected view/open only. Regression: UI and server PATCH guest tests.
7. **Timeline drag can overwrite a newer Google time.** A stale timeline request bypasses both local and provider ETag comparisons. Expected 409. Regression: stale timeline ETag route test.
8. **A failed full Google sync destroys local evidence too early.** Cache and tombstones are deleted before Google returns a complete page set. Expected fetch-first/commit-second. Regression: provider failure leaves cache and tombstones intact.
9. **A reconnect may reuse the previous Google account's refresh token.** If OAuth omits a fresh token, callback falls back to the stored token without proving account identity. Expected safe failure. Regression: reconnect-without-refresh-token route test.
10. **A disconnected Space can be reactivated without proving the new Google account can write it.** Expected calendar-list verification. Regression: disconnected restore under changed account.
11. **Cleanup and timer-repair queues can starve active calendars.** Rows are limited before calendar filtering, so inactive rows can occupy every batch. Expected filter-before-limit. Regression: >batch inactive rows plus one active row.
12. **Timer retry receipts are defeated by the client after a lost response.** Add-time/manual-log retries generate a new key and can double count work. Expected key reuse until confirmed. Regression: abort response then retry same action.

### P2 — serious reliability, validation, and UX failures

1. Magic-link login drops the protected `next` destination.
2. Redirect cookie copying discards response-cookie attributes.
3. Remote task load failure is silent and disables saving indefinitely.
4. Task save failures always claim a delete failed.
5. Cached task validation accepts blank IDs/titles, invalid dates, and oversized block limits; one corrupt item also discards every valid cached item.
6. Inline title/custom duration/inline due-date paths can create database-invalid task state.
7. `parseDuration("0.1")` returns zero instead of rejecting it.
8. Scheduler preference limits above 10,080 reach the database and become a generic 500.
9. Cross-Space busy events remain editable from the wrong Space filter.
10. Event edits use the selected calendar timezone instead of the event's Space timezone.
11. Google requests have no explicit timeout and cached event GET is unbounded.
12. Full task/work history remains in the database after task deletion but becomes inaccessible; task-dependent repair cannot complete.
13. Lock-release errors can mask already-successful scheduler/timer operations.
14. Missed-block Start prefers an unrelated current/future block over the explicitly selected missed block.
15. `.env.local` has overly broad local permissions.
16. Production and development dependency audits contain known advisories.
17. Chrome E2E is absent from CI; present local tests default to Chromium and were not runnable as Chrome.
18. Scheduler settings and Spaces have missing recovery actions for load failures.

### P3 — polish and accessibility

1. Interactive calendar buttons override their role to `listitem`.
2. Profile/priority menus do not implement full arrow-key/focus-return behavior.
3. Modal focus trapping and return-focus proof are missing.
4. OAuth error paths retain one-time cookies until expiry.
5. Current design documentation says deadline-first ordering while current product/tests use priority-first ordering.

## Evidence boundaries and blockers

- Chrome is the required browser and is unavailable in this environment. No Chromium/Safari/Firefox substitution was used.
- Two QA email accounts and one writable QA-only Google Calendar were not available, so no real Supabase email, Google consent, provider mutation, two-account, two-device, quota, or cleanup journey was executed.
- Docker/Podman is unavailable, so local pgTAP behavior tests were not run. Linked migration parity and schema lint did run.
- Public HTTP proved route status and headers, but it did not prove the deployed Git SHA.
- No screenshots were captured, so visual, responsive, zoom, contrast, focus, touch-target, and pixel-shift rows remain BLOCKED.

## Remediation gate

Fixes must now proceed in P1 -> P2 -> P3 rounds. Each confirmed fix needs a regression test where practical, related checks, then the full suite. No production deployment is authorized by this audit.
