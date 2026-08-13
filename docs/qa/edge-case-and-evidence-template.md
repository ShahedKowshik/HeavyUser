# HeavyUser edge-case and evidence checklist

Use this checklist to fill the matrix in a change contract. Mark an item
`N/A` only when the reason is written down.

Each risky change gets its own new Change ID. The ID in the manifest must match
the ID in the filled Markdown contract, and the contract must be changed in the
same work as the code.

## State and persistence

- First load, reload, sign-out, and sign-in again
- Empty data versus missing data
- Failed save, stale local data, offline recovery, and last successful baseline
- Delete, move, archive, disconnect, reconnect, and partial cleanup

## Duplicate work and retries

- Double click or duplicate request
- Two tabs or two devices changing the same record
- Lost response after the provider or database already succeeded
- Worker retry, stable operation identity, attempt count, and bounded backoff
- Lock acquisition, lock release, timeout, and cleanup failure

## Google Calendar and provider behavior

- Expired or revoked OAuth grant
- Provider 400, 401, 403, 404, 409, 410, 429, 500, timeout, and malformed data
- Partial provider cleanup and retry after reconnect
- Event ownership, ETag conflict, duplicate reconciliation, and deletion
- Webhook acknowledgement versus retryable failure

## Time and scheduling

- Explicit ISO/UTC instants in tests
- Owning planning or Calendar timezone
- DST start and end
- All-day events
- Night Owl logical day boundary
- Busy, transparent, locked, past, active, missed, and overrun blocks

## User interface lifecycle

- Focus, keyboard, Escape, outside click, blur, and native picker dismissal
- Loading, success, empty, error, and simultaneous-error states
- Narrow phone, tablet, and desktop widths
- Specific accessible locators without hidden live-region ambiguity

## Security and evidence

- Account isolation and ownership checks
- Protected API JSON errors versus page redirects
- Migration parity and real database behavior tests
- Mocked, local, provider-QA, and production evidence kept separate
- Exact deployed SHA, clean tree, generated-file check, and post-deployment route

## Evidence rules

`PASS` means the named test or check actually ran. `BLOCKED` means the required
environment or account was unavailable. `NOT RUN` means it was not attempted.
Neither is a successful proof. Public routes and mocked authenticated tests do
not prove a live signed-in Google, email, or Supabase journey.
