# HeavyUser

> Make the next important task obvious—and protect the time to do it.

HeavyUser is a focused execution workspace for people carrying more active work than a simple to-do list can hold. It puts a prioritized task queue beside a single-day planner so the next action and the time to do it stay in the same view.

**[Open the live app](https://web.heavyuser.app)** · **[View the source](https://github.com/ShahedKowshik/HeavyUser)** · **[Share feedback](https://github.com/ShahedKowshik/HeavyUser/issues/new)**

## The product

Most task tools make capture easy, then leave prioritization and time protection disconnected. HeavyUser is built around one daily job:

1. Decide what matters next.
2. See when the day can support it.
3. Keep moving without opening a dashboard full of noise.

The interface is deliberately small: a task queue on the left, a single-day planner on the right, and a compact shell around them. It is a workbench, not a dashboard.

## What works today

- Add tasks with a title, estimate, start date, due date, and priority.
- Edit, complete, delete, and reorder tasks.
- Move between Backlog, Today, and Upcoming views derived from task dates.
- Select one focus task so the next action stays visible.
- Review a deterministic read-only day planner alongside the queue.
- Sign in with a passwordless email link and keep tasks synced to Supabase.
- Import existing local tasks once when a new account has no cloud tasks yet.
- Edit the account display name and private profile portrait.
- Use the responsive layout on desktop and mobile, with keyboard-accessible controls and visible focus states.

## Product principles

- **Task-first:** the next piece of work gets the strongest visual priority.
- **Time belongs next to work:** planning is part of execution, not a separate report.
- **Quiet until useful:** neutral surfaces carry the interface; green marks focus, current time, today, and completion.
- **Small surface area:** one problem, one focused screen, no speculative features.
- **Fast learning loop:** ship a useful slice, put it in front of people, and let real use decide what comes next.

## Current status

HeavyUser is an early product slice in active iteration. The workspace requires a HeavyUser account and uses Supabase Auth, Postgres row-level security, and private Storage for account portraits. Collaboration, integrations, and calendar editing remain outside the current surface.

## Deployment

The production app is hosted on Vercel:

- **Production:** [web.heavyuser.app](https://web.heavyuser.app)
- **Deployment target:** Vercel
- **Build output:** Next.js server runtime

## Run locally

Requirements: Node.js 24+ and pnpm.

```bash
git clone https://github.com/ShahedKowshik/HeavyUser.git
cd HeavyUser
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify the build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Stack

- Next.js App Router with server-side Supabase sessions
- React 19 and TypeScript
- Tailwind CSS v4
- shadcn `base-lyra` preset with neutral tokens and Lucide icons
- Supabase Auth, Postgres task storage, and private avatar Storage
- User-scoped browser cache for task recovery and one-time migration
- Vercel for production hosting

## Project map

```text
src/app/page.tsx       Product surface, task interactions, persistence, and planner data
src/app/login/         Passwordless account entry screen
src/app/auth/          Magic-link confirmation route
src/components/        Auth provider and profile editor
src/app/globals.css    Design tokens, layout, responsive rules, and calendar geometry
src/app/layout.tsx     App metadata and typography setup
design.md              Product thesis and visual constraints
components.json        shadcn preset configuration
```

## Feedback

If HeavyUser helps—or gets in your way—[open an issue](https://github.com/ShahedKowshik/HeavyUser/issues/new) with:

- the kind of workday you were trying to manage;
- what you expected to happen;
- what actually happened; and
- what would make the next decision easier.

Specific stories are more useful than generic feature requests.

## License

This repository does not currently include a license for reuse.
