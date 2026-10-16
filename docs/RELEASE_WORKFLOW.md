# HeavyUser: development previews and controlled releases

The public website `web.heavyuser.app` is the latest successful deployment of `main`, **not** the latest changes in a pull request.

## How changes are reviewed

1. Work on a **feature branch**, not directly on `main`.
2. After each change, let **GitHub Actions** run TypeScript, tests, and a production build. These checks do **not** create a Vercel deployment.
3. For a true, interactive app preview before a release, run HeavyUser locally using `npm run dev` or make **one deliberate** Vercel preview deployment from the ready branch.
4. After review, merge the branch to `main`. That triggers the production deployment.
5. Confirm the new deployment is READY, then verify `web.heavyuser.app` shows the merged commit before saying it is live.

## What prevents the Hobby deployment rate limit

`vercel.json` disables **automatic deployments on feature branches**, including `feature/`, `fix/`, and `redesign/` branches. Automatic deployment remains enabled on `main`. Explicit manual preview deployments are still possible.

**Important:** Do not use Vercel's *Ignored Build Step* as the quota solution. Vercel explicitly says canceled builds still count towards the deployment limit. This configuration blocks automatic Git-triggered deployments on development branches at source.

The policy uses documented minimatch branch selection: the `**` rule disables branch deployments by default, while the more specific `main: true` exception enables production. When a branch matches multiple patterns, Vercel documents that a `true` rule wins.

## Local preview on Mac, with no Vercel deployment

In the local HeavyUser project folder:
```bash
git fetch origin
git switch feature/custom-habit-day-start-date-signout-safety
npm ci
npm run dev
```

Open **http://localhost:3000**. If the branch is not set up locally, create it by tracking the origin branch. Node 24 is required. The project needs `.env.local` containing the two *public/publishable* Supabase settings described in `.env.example`. Never commit `.env.local`. Use a separate test account; development can write to any connected Supabase database. The app's UI refreshes as files change. The local preview runs only while the Mac development server is running.

For remote visual review after the deployment quota resets: create **one manual Vercel preview**, check it on desktop/mobile, and share that specific URL. Do not create a new preview for every little commit.

## Limits and sources
- Vercel Hobby: 100 deployments / rolling 24 hours, and a separate 32 builds/hour constraint.
- https://vercel.com/docs/limits
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/docs/project-configuration/project-settings
- https://vercel.com/docs/cli/env
