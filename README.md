# HeavyUser — clean rebuild baseline

HeavyUser has been reset to a minimal Next.js application. The old task manager, Google Calendar sync, scheduler, timer, and previous design system are **not** part of the active `main` branch.

The product's next features and visual design are deliberately undecided.

## Develop

Use Node.js 24.

```bash
npm install
npm run dev
```

## Verify changes

```bash
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same checks on every push to `main` and every pull request. The app currently has no backend credentials or Supabase connection.

## Infrastructure

- GitHub: `ShahedKowshik/HeavyUser`
- Hosting: existing Vercel `heavyuser` project
- Site: `https://web.heavyuser.app`
- Database: existing Supabase project (cleaned and reserved for later)

The pre-reset source and history can be recovered from `archive/pre-rebuild-2026-10-13` at `79dc2848627a397bebb7ea7c0bccb9a343da3231`.

The existing Supabase avatar bucket/object and obsolete Vercel environment variables are not used by the clean app and require dashboard/API cleanup. Avoid deleting Supabase storage metadata directly with SQL; remove files through the Storage API.

**Dependency note:** A committed npm lockfile has not yet been generated; dependency resolution is not fully reproducible until it is added. Do not claim hermetic builds from this baseline.
