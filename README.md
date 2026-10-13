# HeavyUser — rebuild baseline

This repository has been reset to a minimal Next.js shell. No old task manager, calendar connection, scheduler, timer, UI design system, or product database models are included. The product scope will be decided later.

## Development

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`

## Hosting

Keep the existing Vercel project and the `web.heavyuser.app` custom domain. Supabase organization and project may be reused for a future application. This baseline does not connect to Supabase or consume Vercel secrets.

## Recovery

The pre-rebuild application is preserved in Git branch `archive/pre-rebuild-2026-10-13` at commit `79dc2848627a397bebb7ea7c0bccb9a343da3231`.
