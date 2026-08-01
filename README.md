# HeavyUser

HeavyUser is a focused personal productivity workspace. The first screen keeps a task queue beside a single-day planner so work and the time protecting it can be read together.

## Current screen

- A task queue on the left at 60% of the desktop workspace.
- A single-day vertical planner on the right at 40%.
- A compact task-view rail with notification and profile controls in the top bar.
- Light theme first, compact spacing, flat borders, and square HeavyUser controls (`0px` product radius).
- The semantic green `--primary` token is used for active, current, focus, today, and completion states; `--primary-soft` and `--primary-line` keep the related surfaces and borders green too.
- Neutral surfaces carry the screen; `--destructive` is reserved for destructive actions.
- Tasks support add, edit, complete/uncomplete, delete, and reorder.
- Task views include Backlog, Overdue, Today, and Upcoming; the views are derived from start and due dates.
- Editing opens a focused task dialog with title, duration, start date, deadline, and priority fields.
- Dates are displayed consistently as `DD Mmm YY` (for example, `02 Apr 26`) across task rows, editors, and planner labels.
- Task changes persist in browser `localStorage`; the planner is display-only.
- Task-only scope; no date navigation, planner editing, or drag-to-planner behavior yet.

## Stack

- Next.js App Router
- React and TypeScript in `src/`
- Tailwind CSS v4
- ESLint
- shadcn `base-lyra` preset with neutral base, CSS variables, and Lucide icons
- `@/*` import alias

This environment did not expose a standalone npm executable, so the project uses the bundled pnpm runtime and keeps the package-manager path local to the development session. The source does not depend on global configuration.

## Local development

The configured project path is `/Users/kowshik/Projects/HeavyUser`.

```bash
cd /Users/kowshik/Projects/HeavyUser
pnpm dev
```

Open `http://localhost:3000` in a browser.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Project map

- `src/app/page.tsx` — functional screen, task interactions, local persistence, and typed mock data.
- `src/app/globals.css` — tokens, layout, calendar geometry, and responsive rules.
- `public/dummy-portrait.svg` — local placeholder portrait used by the profile control.
- `src/app/layout.tsx` — metadata and typography setup.
- `design.md` — visual and product constraints for this phase.
- `components.json` — exact shadcn preset configuration.
- `AGENTS.md` — concise instructions for future implementation sessions.
