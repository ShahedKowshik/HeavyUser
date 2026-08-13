# HeavyUser Supabase

This folder is the reviewable source of truth for HeavyUser's Supabase setup.
The linked production project remains the runtime source of truth, so migration
parity and generated types should be checked before database work is shipped.

## Layout

- `migrations/` — append-only database changes, applied in timestamp order.
- `tests/database/` — pgTAP security and integrity checks run in CI.
- `templates/` — versioned authentication email templates.
- `config.toml` — local development and deployable Auth/API settings.

## Access model

- `tasks`, `spaces`, and `sub_spaces` are the only tables written directly by
  the signed-in browser. Their RLS policies limit every row to its owner.
- Calendar credentials, scheduler state, and timer history are server-only.
  The browser roles have no grants or policies on those tables.
- The service-role key is server-only and must never use a `NEXT_PUBLIC_` name
  or be committed to the repository.
- The private `avatars` bucket accepts only images inside the current user's
  own folder.

## Routine checks

Run these from the repository root:

```sh
pnpm preflight
pnpm supabase:check
pnpm supabase:types:check
pnpm typecheck
```

`supabase:check` compares local and linked migrations, lints the live schema,
and shows current high-signal advisor warnings. `supabase:types` refreshes the
checked-in TypeScript map from the linked database; `supabase:types:check`
compares the generated result without rewriting the checked-in file. Refresh
the file only as an intentional, scoped database change and review the diff
before committing it.

Database changes must declare their migration impact in
`.heavyuser/change-manifest.json`. Migration parity and schema lint are
required release evidence, but they do not replace linked behavior tests or a
provider-backed QA journey.

The server-only tables intentionally have RLS enabled with no user policies.
That is default-deny defense in depth, not a missing access path. The hosted
`pg_net` extension is non-relocatable in this project, so its advisor notice is
documented rather than repaired with a risky drop-and-recreate operation.
Supabase Auth's leaked-password protection is a hosted dashboard setting; it
must be enabled in Authentication settings before password-based sign-in is
introduced or before the final production security sign-off.
