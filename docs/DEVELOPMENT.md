# Development and verification

## Requirements

- Node.js **24.x**
- npm (the repository uses `package-lock.json`)
- A Supabase backend with the compatible schema and Row Level Security policies

## Run locally

```bash
git clone https://github.com/ShahedKowshik/HeavyUser.git
cd HeavyUser
npm ci
cp .env.example .env.local
npm run dev
```

Update `.env.local` with your own Supabase project URL and **publishable** key. Local Next.js typically runs at http://localhost:3000.

**The fresh-backend limitation matters:** Neither SQL schema/migrations nor a local Supabase bootstrap are checked into this repository. Pointing the application at an empty project will cause data requests to fail. To make this repo independently self-hostable, schema, RLS, functions, triggers, and seed/test fixtures still need to be captured in reviewed migrations.

Do not add real credentials to issues, PRs, screenshots, or commits. Never expose a service-role key in browser variables.

## Verify changes

```bash
npm run typecheck
npm test
npm run build
```

GitHub Actions performs those three checks on changes to `main` and its pull requests. The present codebase does not define an ESLint script or a complete browser/E2E test command; do not claim they were executed.

## Working agreements

- Start with a reproducible issue and expected behavior.
- Keep product changes small and tied to a clear outcome.
- Preserve existing semantics for absent, skipped, missed, and recorded data.
- Add regression tests to accompany data or undo fixes.
- Consider mobile, empty states, slow connections, double clicks, concurrent edits, and session expiry.
- Verify all views agree after an action: Today, Week, calendar, and insights.
- Explain database migrations and rollback considerations when a change needs backend modifications.
- Run CI before merging; review changes to authentication, deletion, or data integrity especially carefully.

Read [architecture](ARCHITECTURE.md), [data consistency QA](DATA_CONSISTENCY_QA.md), and [CONTRIBUTING.md](../CONTRIBUTING.md) first.

## Troubleshooting

| Symptom | First check |
| --- | --- |
| Configuration required | Are both `NEXT_PUBLIC_SUPABASE_*` values in `.env.local`? |
| Sign-in fails | Confirm authentication settings and the project's valid redirect URLs |
| Backend returns missing-table/function errors | Compatible schema/migrations are not currently supplied by the repo |
| Statistics disagree with an entry | Reproduce the exact date and steps, including any undo or historical edits |
| Dates differ while traveling | The frontend currently uses the `Asia/Dhaka` timezone |
| Build fails | Confirm Node 24, run `npm ci`, then `npm run typecheck` |

For a security problem, follow [SECURITY.md](../SECURITY.md) instead of filing a public issue.
