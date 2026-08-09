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
pnpm supabase:check
pnpm supabase:types
pnpm typecheck
```

`supabase:check` compares local and linked migrations, lints the live schema,
and shows current high-signal advisor warnings. `supabase:types` refreshes the
checked-in TypeScript map from the linked database; review that diff before
committing it.

The server-only tables intentionally have RLS enabled with no user policies.
That is default-deny defense in depth, not a missing access path. The hosted
`pg_net` extension is non-relocatable in this project, so its advisor notice is
documented rather than repaired with a risky drop-and-recreate operation.
