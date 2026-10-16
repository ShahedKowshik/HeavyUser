# HeavyUser 2.0 — Habit Tracker MVP
A focused daily habit tracker for check-off, quantity, duration, and detailed sleep habits.
## Technology
Next.js 16 / React 19 / Supabase Auth + Postgres (RLS) / Vercel.
## Environment
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel; values are public client configuration (never use the secret/service role key).
## Local development
Node 24: `npm ci && npm run dev`.
## Validate
`npm run typecheck`, `npm test`, `npm run build`.
## Design
Design system preset: [shadcn/ui Lyra, Neutral, Inter, Lucide](https://ui.shadcn.com/create?preset=buFywKm). Its semantic token foundation and styling are maintained in `src/app/design-system.css`; reference documentation is in `DESIGN_SYSTEM.md`. The app retains its existing native React controls while the preset-aligned visual styling is applied; the full shadcn/Base UI component packages are not installed.

Responsive Today dashboard, insights, create/edit habits, historical log, detailed sleep entry, pause/resume duration tracking. Uses native fetch for Supabase Auth and PostgREST; no extra runtime dependency.
## Limitations
Recordings are personal estimates; sleep does not represent clinical measurement. Insights are introductory. Advanced reminders and integrations excluded.
