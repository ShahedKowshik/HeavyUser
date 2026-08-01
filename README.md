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
- Move between Backlog, Overdue, Today, and Upcoming views derived from task dates.
- Select one focus task so the next action stays visible.
- Review a deterministic read-only day planner alongside the queue.
- Keep task data in the browser with local-first `localStorage` persistence.
- Use the responsive layout on desktop and mobile, with keyboard-accessible controls and visible focus states.

## Product principles

- **Task-first:** the next piece of work gets the strongest visual priority.
- **Time belongs next to work:** planning is part of execution, not a separate report.
- **Quiet until useful:** neutral surfaces carry the interface; green marks focus, current time, today, and completion.
- **Small surface area:** one problem, one focused screen, no speculative features.
- **Fast learning loop:** ship a useful slice, put it in front of people, and let real use decide what comes next.

## Current status

HeavyUser is an early product slice in active iteration. The current build is intentionally local-first and has no backend, authentication, collaboration, or server-side sync yet. The best next step is repeated use by people whose workday feels crowded, followed by specific feedback on what helps them decide and follow through.

## Deployment

The production app is hosted on Vercel:

- **Production:** [web.heavyuser.app](https://web.heavyuser.app)
- **Deployment target:** Vercel
- **Build output:** Next.js static export

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

- Next.js App Router with static export
- React 19 and TypeScript
- Tailwind CSS v4
- shadcn `base-lyra` preset with neutral tokens and Lucide icons
- Browser `localStorage` for the current local-first task model
- Vercel for production hosting

## Project map

```text
src/app/page.tsx       Product surface, task interactions, persistence, and planner data
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
