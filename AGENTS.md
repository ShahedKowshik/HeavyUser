# HeavyUser agent guide

HeavyUser is a focused personal productivity workspace. The current product surface is intentionally small: a compact authenticated account bar, synced tasks on the left, a single-day vertical calendar on the right, and a dedicated account/settings page.

## Repository location

- The authoritative runnable checkout is `/Users/kowshik/Projects/HeavyUser`.
- `/Users/kowshik/.codex/.chatgpt-projects/g-p-6a53428369508191b1e12179b516b0c3` is a reference-only ChatGPT project mirror, not the application source. Verify the checkout before editing.

## Current scope

- Keep the first screen light, compact, flat, and focused on the task workspace.
- Keep task interactions fast and constrained to the task region, with Supabase as the authenticated source of truth.
- Keep account entry passwordless and separate from the task workspace.
- Preserve the 60/40 desktop split and stack tasks above the calendar below 900px.
- Keep task rows single-line and scannable: title, duration, state, and compact actions only.

## Non-goals

Do not add additional navigation destinations, dashboards, password authentication, OAuth providers, MFA, collaboration, calendar editing, drag-to-calendar behavior, date navigation, integrations, or extra product areas without a new request. The profile menu is limited to account access, Settings, and sign out. Authentication, task sync, private avatar storage, and account-synced settings are part of the current phase.

## Important files

- `src/app/page.tsx` — first screen, task interactions, and user-scoped cache.
- `src/app/login/` and `src/app/auth/` — passwordless account entry and magic-link confirmation.
- `src/components/auth-provider.tsx` — browser session, profile state, and account-synced settings.
- `src/app/globals.css` — HeavyUser visual system and responsive layout.
- `src/app/layout.tsx` — metadata and font setup.
- `design.md` — design authority for this phase.
- `components.json` — shadcn preset configuration.

## Checks

Use the local bundled runtime when needed. Run `pnpm lint`, `pnpm typecheck`, and `pnpm build` before handoff.
